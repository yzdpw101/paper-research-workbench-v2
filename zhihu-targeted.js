import { chromium } from 'playwright';

const port = 9222;
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
const page = browser.contexts()[0].pages()[0] || await browser.contexts()[0].newPage();

const queries = [
  '毫米波雷达 工程师 薪资 发展',
  '射频工程师 嵌入式 就业',
  '电磁场 微波 转行 嵌入式开发',
  '自动驾驶 感知算法 嵌入式 岗位',
  'DSP 嵌入式 信号处理 就业方向',
];

for (const q of queries) {
  console.log('\n' + '='.repeat(55));
  console.log('🔍 ' + q);
  console.log('='.repeat(55));
  
  await page.goto('https://www.zhihu.com/search?type=content&q=' + encodeURIComponent(q), { waitUntil: 'domcontentloaded', timeout: 20000 });
  await new Promise(r => setTimeout(r, 2500));
  
  const results = await page.evaluate(() => {
    const items = [];
    document.querySelectorAll('.List-item, [class*="SearchResult"]').forEach(card => {
      const title = (card.querySelector('h2') || card.querySelector('[class*="title"] a') || card.querySelector('.HighlightTitle'))?.textContent?.trim() || '';
      const desc = (card.querySelector('.RichText') || card.querySelector('[class*="excerpt"]') || card.querySelector('[class*="summary"]'))?.textContent?.trim()?.slice(0,200) || '';
      const a = card.querySelector('a[href*="zhihu.com"]');
      const link = a ? a.href : '';
      if (title) items.push({ title, desc, link });
    });
    return items.slice(0, 4);
  });
  
  for (const r of results) {
    console.log('  📌 ' + r.title);
    if (r.desc) console.log('     ' + r.desc);
    console.log('     🔗 ' + r.link);
  }
  
  await new Promise(r => setTimeout(r, 1200));
}

await browser.close();
console.log('\n✅ 完成');
