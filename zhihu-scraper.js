/**
 * zhihu-scraper.js — 通过 CDP 连接已登录 Chrome，爬取知乎内容
 * 
 * 用法: node zhihu-scraper.js --search "关键词" [--max 10] [--port 9222]
 * 
 * 前提: Chrome 已通过 open-cdp.bat 启动，且知乎已登录
 */

import { chromium } from 'playwright';

// ── 参数解析 ────────────────────────────────────────────────
function opt(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const keyword = opt('--search', '嵌入式开发学习路线');
const maxArticles = parseInt(opt('--max', '10'));
const port = parseInt(opt('--port', '9222'));

// ── CDP 连接 ────────────────────────────────────────────────
async function connectCDP(port) {
  try {
    await fetch(`http://localhost:${port}/json/version`);
  } catch {
    console.error(`❌ CDP Chrome 未在端口 ${port} 运行`);
    process.exit(1);
  }
  
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const contexts = browser.contexts();
  const context = contexts[0];
  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();
  return { browser, context, page };
}

// ── 知乎搜索 ────────────────────────────────────────────────
async function searchZhihu(page, keyword) {
  const searchUrl = `https://www.zhihu.com/search?type=content&q=${encodeURIComponent(keyword)}`;
  console.log(`[搜索] ${searchUrl}`);
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, 800));
    await page.waitForTimeout(1000);
  }
  
  const results = await page.evaluate(() => {
    const items = [];
    const cards = document.querySelectorAll('.List-item, .SearchResult-Card, [class*="SearchResult"]');
    
    cards.forEach(card => {
      const titleEl = card.querySelector('h2, .HighlightTitle, [class*="title"] a');
      const descEl = card.querySelector('.RichText, .SearchItem-summary, [class*="excerpt"], [class*="summary"]');
      const linkEl = card.querySelector('a[href*="/answer/"], a[href*="/p/"], a[href*="/question/"]');
      const metaEl = card.querySelector('[class*="meta"], [class*="footer"]');
      
      const title = titleEl?.textContent?.trim() || '';
      const desc = descEl?.textContent?.trim() || '';
      const link = linkEl?.href || '';
      const meta = metaEl?.textContent?.trim() || '';
      
      if (title) {
        items.push({ title, desc: desc.slice(0, 300), link, meta });
      }
    });
    
    return items;
  });
  
  return results;
}

// ── 主流程 ──────────────────────────────────────────────────
(async () => {
  console.log(`🔗 连接 CDP Chrome (端口 ${port})...`);
  const { browser, page } = await connectCDP(port);
  console.log('✅ 已连接\n');
  
  try {
    const keywords = [
      '嵌入式开发学习路线 2024',
      '嵌入式工程师 就业前景 方向选择',
      '嵌入式 Linux 学习经验',
      '毫米波雷达 嵌入式 DSP',
      '汽车电子 嵌入式 发展前景',
    ];
    
    const allResults = {};
    
    for (const kw of keywords) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🔍 ${kw}`);
      console.log('='.repeat(60));
      
      try {
        const results = await searchZhihu(page, kw);
        console.log(`  找到 ${results.length} 条\n`);
        
        allResults[kw] = results.slice(0, maxArticles);
        
        for (const r of results.slice(0, maxArticles)) {
          console.log(`  📌 ${r.title}`);
          console.log(`     ${r.desc.slice(0, 150)}`);
          console.log(`     🔗 ${r.link}`);
          if (r.meta) console.log(`     📊 ${r.meta}`);
          console.log();
        }
      } catch (e) {
        console.error(`  ❌ ${e.message}`);
      }
    }
    
    const fs = await import('fs');
    fs.writeFileSync('zhihu-results.json', JSON.stringify(allResults, null, 2), 'utf-8');
    console.log(`\n📁 已保存到 zhihu-results.json`);
    
  } catch (e) {
    console.error('❌', e.message);
  }
  
  await browser.close();
  console.log('\n✅ 完成');
})();
