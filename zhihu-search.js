import { chromium } from 'playwright';
import fs from 'fs';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const page = browser.contexts()[0].pages()[0] || await browser.contexts()[0].newPage();

const keywords = [
  '嵌入式工程师 方向选择 就业前景',
  '电磁场 微波 转行 嵌入式开发',
  '毫米波雷达 嵌入式 就业前景',
  '汽车电子 嵌入式 发展前景 薪资',
  '嵌入式开发学习路线 高级 完整',
  'STM32 转 嵌入式 Linux 学习经验 多久',
  '嵌入式 Linux 驱动 学习路线',
  '嵌入式 薪资 2024 2025 行情',
  '自动驾驶 感知 嵌入式 岗位要求',
  '射频工程师 嵌入式 区别 前景',
  '研究生 嵌入式 出路 方向',
  '天线 微波 嵌入式 结合',
];

const allResults = [];

for (const kw of keywords) {
  console.log(`🔍 ${kw}`);
  await page.goto(`https://www.zhihu.com/search?type=content&q=${encodeURIComponent(kw)}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));
  await page.evaluate(() => window.scrollBy(0, 600));
  await new Promise(r => setTimeout(r, 500));
  
  const results = await page.evaluate((k) => {
    return Array.from(document.querySelectorAll('.List-item'))
      .filter(card => card.querySelector('a[href*="/p/"], a[href*="/question/"]'))
      .slice(0, 6)
      .map(card => {
        const title = card.querySelector('.ContentItem-title, h2')?.textContent?.trim() || '';
        const link = card.querySelector('a[href*="/p/"], a[href*="/question/"]')?.href || '';
        const desc = card.querySelector('.RichText')?.textContent?.trim()?.slice(0, 300) || '';
        const text = card.textContent || '';
        const vm = text.match(/赞同\s*(\S+)/);
        const cm = text.match(/(\d+)\s*条评论/);
        return {
          title, link, description: desc,
          type: link.includes('/p/') ? 'column' : 'question',
          votes: vm ? vm[1] : '',
          comments: cm ? cm[1] : '',
          keyword: k,
        };
      });
  }, kw);
  
  allResults.push({ keyword: kw, results });
  console.log(`  → ${results.length} 条`);
  await new Promise(r => setTimeout(r, 1000));
}

// 去重
const seen = new Set();
for (const grp of allResults) {
  grp.results = grp.results.filter(r => {
    if (seen.has(r.link)) return false;
    seen.add(r.link);
    return true;
  });
}

const unique = allResults.flatMap(g => g.results);

fs.writeFileSync('zhihu-search.json', JSON.stringify({ allResults, uniqueCount: unique.length, unique }, null, 2), 'utf-8');
console.log(`\n✅ 共 ${unique.length} 条去重 → zhihu-search.json`);

// 摘要
const qs = unique.filter(r => r.type === 'question');
const cs = unique.filter(r => r.type === 'column');
console.log(`问答: ${qs.length} | 专栏: ${cs.length}`);

console.log('\n═══ TOP 问答 ═══');
qs.slice(0,15).forEach(r => console.log(`  📌 ${r.title.slice(0,60)}\n     🔗 ${r.link}`));

console.log('\n═══ TOP 专栏 ═══');
cs.slice(0,10).forEach(r => console.log(`  📝 ${r.title.slice(0,60)} | 赞:${r.votes}\n     🔗 ${r.link}`));

await browser.close();
console.log('\n✅ DONE');
