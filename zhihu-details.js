import { chromium } from 'playwright';
import fs from 'fs';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const page = browser.contexts()[0].pages()[0] || await browser.contexts()[0].newPage();

// 精选最相关的 URL
const targets = {
  questions: [
    'https://www.zhihu.com/question/660024993',        // 微波射频转单片机
    'https://www.zhihu.com/question/1945433821681026263', // 微波电路or嵌入式
    'https://www.zhihu.com/question/661834744',         // 雷达硕士就业
    'https://www.zhihu.com/question/629136477',         // 毫米波雷达工作
    'https://www.zhihu.com/question/1887426508957664438', // 雷达出路
    'https://www.zhihu.com/question/637457169',         // 学雷达怎么办
    'https://www.zhihu.com/question/622109628',         // 毫米波雷达就业
    'https://www.zhihu.com/question/613083643',         // 天线微波最差方向？
  ],
  columns: [
    'https://zhuanlan.zhihu.com/p/1994435640637547709',  // 2026卷哪个方向(47赞)
    'https://zhuanlan.zhihu.com/p/2037857625178690959',  // 聪明人发现不对劲(14赞)
    'https://zhuanlan.zhihu.com/p/1904229006062100807',  // 完整学习路线(525赞)
    'https://zhuanlan.zhihu.com/p/21640080666',          // 10k~30k路线(157赞)
    'https://zhuanlan.zhihu.com/p/1890501877705183435',  // 车企薪资
    'https://zhuanlan.zhihu.com/p/1994773665921901790',  // 嵌入式行情
    'https://zhuanlan.zhihu.com/p/2052541595854153290',  // 薪水怎么样
  ],
};

const allDetails = { questions: [], columns: [] };

// ── 抓取问题 ──
for (const qUrl of targets.questions) {
  try {
    console.log(`📋 ${qUrl.slice(-25)}`);
    await page.goto(qUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await new Promise(r => setTimeout(r, 2500));
    
    // 滚动
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => window.scrollBy(0, 600));
      await new Promise(r => setTimeout(r, 400));
    }
    
    // 展开
    const btns = await page.$$('button:has-text("展开")');
    for (const b of btns.slice(0, 6)) { try { await b.click(); await new Promise(r => setTimeout(r, 200)); } catch {} }
    
    const data = await page.evaluate(() => {
      const qTitle = document.querySelector('.QuestionHeader-title')?.textContent?.trim() || '';
      const answers = Array.from(document.querySelectorAll('.List-item'))
        .filter(item => { const rt = item.querySelector('.RichText'); return rt && rt.textContent.trim().length > 50; })
        .slice(0, 8)
        .map(item => {
          const author = item.querySelector('[class*="AuthorInfo-name"]')?.textContent?.trim()?.replace(/关注.*/,'')?.trim()?.slice(0,30) || '';
          const content = item.querySelector('.RichText')?.textContent?.trim() || '';
          const text = item.textContent || '';
          const vm = text.match(/赞同\s*(\S+)/);
          const authorBio = item.querySelector('[class*="AuthorInfo-badge"], [class*="bio"]')?.textContent?.trim()?.slice(0,60) || '';
          return {
            author, authorBio,
            votes: vm ? vm[1] : '',
            content: content.slice(0, 2500),
            len: content.length,
          };
        });
      return { qTitle, answers };
    });
    
    console.log(`  → 《${data.qTitle.slice(0,40)}》${data.answers.length}个回答`);
    allDetails.questions.push({ url: qUrl, title: data.qTitle, answers: data.answers });
  } catch(e) { console.log(`  ❌ ${e.message}`); }
  await new Promise(r => setTimeout(r, 1500));
}

// ── 抓取专栏 ──
for (const cUrl of targets.columns) {
  try {
    console.log(`📝 ${cUrl.slice(-25)}`);
    await page.goto(cUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await new Promise(r => setTimeout(r, 2500));
    
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollBy(0, 500));
      await new Promise(r => setTimeout(r, 300));
    }
    
    const article = await page.evaluate(() => ({
      title: document.querySelector('.Post-Title, h1')?.textContent?.trim() || '',
      author: document.querySelector('[class*="AuthorInfo-name"]')?.textContent?.trim()?.replace(/关注.*/,'')?.trim() || '',
      content: (document.querySelector('.RichText, .Post-RichTextContainer, article')?.textContent?.trim() || '').slice(0, 5000),
    }));
    
    console.log(`  → 《${article.title.slice(0,40)}》(${article.content.length}字)`);
    allDetails.columns.push({ url: cUrl, ...article });
  } catch(e) { console.log(`  ❌ ${e.message}`); }
  await new Promise(r => setTimeout(r, 1000));
}

fs.writeFileSync('zhihu-details.json', JSON.stringify(allDetails, null, 2), 'utf-8');
console.log(`\n✅ 问答${allDetails.questions.length} | 专栏${allDetails.columns.length} → zhihu-details.json`);
await browser.close();
console.log('DONE');
