import { chromium } from 'playwright';
import fs from 'fs';

const port = parseInt(process.argv.includes('--port') 
  ? process.argv[process.argv.indexOf('--port') + 1] : '9222');
const url = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1] : null;

async function connectCDP(port) {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const contexts = browser.contexts();
  const context = contexts[0];
  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();
  return { browser, page };
}

async function fetchArticle(page, url) {
  console.log(`\n📄 ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(500);
  }
  
  try {
    await page.click('button:has-text("展开")', { timeout: 2000 });
    await page.waitForTimeout(500);
  } catch {}
  
  const article = await page.evaluate(() => {
    const title = document.querySelector('h1, .Post-Title, .QuestionHeader-title')?.textContent?.trim() || '';
    const content = document.querySelector('.RichText, .Post-RichText, .AnswerItem-content, article')?.textContent?.trim() || '';
    const author = document.querySelector('.AuthorInfo-name, .Post-Author')?.textContent?.trim() || '';
    return { title, author, content };
  });
  
  return article;
}

(async () => {
  const { browser, page } = await connectCDP(port);
  
  try {
    if (url) {
      const article = await fetchArticle(page, url);
      console.log(`\n📌 ${article.title}`);
      console.log(`👤 ${article.author}`);
      console.log(`\n${article.content.slice(0, 3000)}`);
      console.log(`\n... (总长度: ${article.content.length} 字)`);
    } else {
      const results = JSON.parse(fs.readFileSync('zhihu-results.json', 'utf-8'));
      const allUrls = new Set();
      for (const [kw, items] of Object.entries(results)) {
        for (const item of items) {
          if (item.link && item.link.includes('zhihu.com')) allUrls.add(item.link);
        }
      }
      const uniqueUrls = [...allUrls].slice(0, 12);
      console.log(`共 ${uniqueUrls.length} 篇待抓取\n`);
      
      const articles = [];
      for (const u of uniqueUrls) {
        try {
          const article = await fetchArticle(page, u);
          articles.push({ url: u, ...article });
          console.log(`✅ ${article.title.slice(0, 60)} (${article.content.length}字)`);
        } catch (e) {
          console.log(`❌ ${e.message}`);
        }
        await new Promise(r => setTimeout(r, 1500));
      }
      
      fs.writeFileSync('zhihu-articles.json', JSON.stringify(articles, null, 2), 'utf-8');
      console.log(`\n📁 已保存 ${articles.length} 篇`);
    }
  } catch (e) {
    console.error('❌', e.message);
  }
  
  await browser.close();
  console.log('✅ 完成');
})();
