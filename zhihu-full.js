/**
 * zhihu-full.js — 知乎结构化爬虫
 * 
 * 流程: 搜索 → 识别类型(问答/专栏) → 抓取回答+评论 → 结构化输出
 * 用法: node zhihu-full.js
 * 前提: open-cdp.bat chrome 已启动，知乎已登录
 */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = 9222;
const CDP_URL = `http://127.0.0.1:${PORT}`;

// ═══════════════════════════════════════
// 关键词
// ═══════════════════════════════════════
const KEYWORD_GROUPS = {
  '方向选择': [
    '嵌入式工程师 方向选择 就业前景 2024 2025',
    '电磁场 微波 转行 嵌入式开发 方向',
    '毫米波雷达 嵌入式 DSP 就业前景',
    '汽车电子 嵌入式 发展前景 薪资',
  ],
  '学习路线': [
    '嵌入式开发学习路线 2024 高级 完整',
    'STM32 转 嵌入式 Linux 学习经验 多久',
    '嵌入式 Linux 驱动开发 学习路线',
  ],
  '就业市场': [
    '嵌入式工程师 薪资 2024 2025 就业行情',
    '自动驾驶 感知算法 嵌入式 岗位要求',
    '射频工程师 嵌入式 区别 前景',
  ],
};

// ═══════════════════════════════════════
// CDP
// ═══════════════════════════════════════
async function connectCDP() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();
  return { browser, page };
}

// ═══════════════════════════════════════
// 搜索
// ═══════════════════════════════════════
async function searchZhihu(page, keyword, maxResults = 8) {
  const url = `https://www.zhihu.com/search?type=content&q=${encodeURIComponent(keyword)}`;
  console.log(`  🔍 ${keyword.slice(0,40)}`);
  
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await new Promise(r => setTimeout(r, 2500));
  
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => window.scrollBy(0, 600));
    await new Promise(r => setTimeout(r, 500));
  }
  
  const results = await page.evaluate((max) => {
    return Array.from(document.querySelectorAll('.List-item'))
      .filter(card => card.querySelector('a[href*="/p/"], a[href*="/question/"]'))
      .slice(0, max)
      .map(card => {
        const titleEl = card.querySelector('.ContentItem-title, h2');
        const linkEl = card.querySelector('a[href*="/p/"], a[href*="/question/"]');
        const descEl = card.querySelector('.RichText');
        const title = titleEl?.textContent?.trim() || '';
        const link = linkEl?.href || '';
        const description = descEl?.textContent?.trim()?.slice(0, 300) || '';
        const isColumn = link.includes('/p/');
        const fullText = card.textContent || '';
        const voteMatch = fullText.match(/赞同\s*(\S*)/);
        const commentMatch = fullText.match(/(\d+)\s*条评论/);
        return {
          title, link, description,
          type: isColumn ? 'column' : 'question',
          votes: voteMatch ? voteMatch[1] : '',
          comments: commentMatch ? commentMatch[1] : '',
        };
      });
  }, maxResults);
  
  console.log(`    → ${results.length} 条`);
  return results;
}

// ═══════════════════════════════════════
// 抓取问题页（多回答 + 评论）
// ═══════════════════════════════════════
async function scrapeQuestion(page, questionUrl, maxAnswers = 12) {
  console.log(`\n  📋 ${questionUrl.slice(0,60)}...`);
  
  await page.goto(questionUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await new Promise(r => setTimeout(r, 3000));
  
  // 滚动加载回答
  let prevCount = 0, stallCount = 0;
  for (let i = 0; i < 25; i++) {
    await page.evaluate(() => window.scrollBy(0, 700));
    await new Promise(r => setTimeout(r, 500));
    const count = await page.evaluate(() => 
      document.querySelectorAll('.List-item .RichText').length
    );
    if (count === prevCount) { stallCount++; if (stallCount > 4) break; }
    else stallCount = 0;
    prevCount = count;
    if (count >= maxAnswers + 5) break;
  }
  
  // 展开折叠文本
  try {
    const expandBtns = await page.$$('button:has-text("展开"), .RichText-expandButton');
    for (const btn of expandBtns.slice(0, 8)) {
      try { await btn.click({ timeout: 500 }); await new Promise(r => setTimeout(r, 300)); } catch {}
    }
  } catch {}
  
  // 提取
  const data = await page.evaluate((max) => {
    const qTitle = document.querySelector('.QuestionHeader-title')?.textContent?.trim() || '';
    
    const answers = Array.from(document.querySelectorAll('.List-item'))
      .filter(item => {
        const rt = item.querySelector('.RichText');
        return rt && rt.textContent.trim().length > 50;
      })
      .slice(0, max)
      .map((item, idx) => {
        const authorEl = item.querySelector('[class*="AuthorInfo-name"]');
        const contentEl = item.querySelector('.RichText');
        const author = authorEl?.textContent?.trim()?.replace(/关注.*/,'')?.trim()?.slice(0,30) || '';
        const content = contentEl?.textContent?.trim() || '';
        
        // 赞/评论
        const text = item.textContent || '';
        const vm = text.match(/赞同\s*(\S+)/);
        const cm = text.match(/(\d+)\s*条评论/);
        const answerLink = item.querySelector('a[href*="/answer/"]')?.href || '';
        
        return {
          idx, author, answerLink,
          votes: vm ? vm[1] : '',
          comments: cm ? cm[1] : '',
          content: content.slice(0, 3000),
          contentLen: content.length,
        };
      });
    
    return { qTitle, answerCount: answers.length, answers };
  }, maxAnswers);
  
  console.log(`    → ${data.answerCount} 个回答 | ${data.qTitle.slice(0,50)}`);
  return { url: questionUrl, type: 'question', ...data };
}

// ═══════════════════════════════════════
// 抓取专栏
// ═══════════════════════════════════════
async function scrapeColumn(page, columnUrl) {
  console.log(`\n  📝 ${columnUrl.slice(0,60)}...`);
  
  await page.goto(columnUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await new Promise(r => setTimeout(r, 3000));
  
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollBy(0, 500));
    await new Promise(r => setTimeout(r, 400));
  }
  
  const article = await page.evaluate(() => {
    const title = document.querySelector('.Post-Title, h1')?.textContent?.trim() || '';
    const author = document.querySelector('[class*="AuthorInfo-name"]')?.textContent?.trim()?.replace(/关注.*/,'')?.trim() || '';
    const content = document.querySelector('.RichText, .Post-RichTextContainer, article')?.textContent?.trim() || '';
    const text = document.body.textContent || '';
    const vm = text.match(/(\d+)\s*人赞同/);
    const cm = text.match(/(\d+)\s*条评论/);
    return {
      title, author,
      content: content.slice(0, 5000),
      contentLen: content.length,
      votes: vm ? vm[1] : '',
      comments: cm ? cm[1] : '',
    };
  });
  
  console.log(`    → 《${article.title.slice(0,40)}》(${article.contentLen}字)`);
  return { url: columnUrl, type: 'column', ...article };
}

// ═══════════════════════════════════════
// MAIN
// ═══════════════════════════════════════
(async () => {
  console.log('🔗 连接 Chrome CDP...');
  const { browser, page } = await connectCDP();
  console.log('✅ 已连接\n');
  
  const output = { generatedAt: new Date().toISOString(), groups: {}, details: {} };
  
  try {
    // ── Phase 1: 搜索 ──
    console.log('═'.repeat(55));
    console.log('PHASE 1: 搜索');
    console.log('═'.repeat(55));
    
    let allResults = [];
    
    for (const [group, keywords] of Object.entries(KEYWORD_GROUPS)) {
      console.log(`\n📂 ${group}`);
      output.groups[group] = [];
      
      for (const kw of keywords) {
        const results = await searchZhihu(page, kw, 6);
        const enriched = results.map(r => ({ ...r, keyword: kw, group }));
        output.groups[group].push({ keyword: kw, results: enriched });
        allResults = allResults.concat(enriched);
        await new Promise(r => setTimeout(r, 1500));
      }
    }
    
    // 去重
    const seen = new Set();
    const unique = allResults.filter(r => {
      if (seen.has(r.link)) return false;
      seen.add(r.link);
      return true;
    });
    console.log(`\n📊 共 ${allResults.length} 条，去重 ${unique.length} 条`);
    
    // ── Phase 2: 详情 ──
    console.log('\n' + '═'.repeat(55));
    console.log('PHASE 2: 抓取详情');
    console.log('═'.repeat(55));
    
    const questions = unique.filter(r => r.type === 'question');
    const columns = unique.filter(r => r.type === 'column');
    console.log(`问答: ${questions.length} | 专栏: ${columns.length}\n`);
    
    for (const q of questions.slice(0, 10)) {
      try {
        const qMatch = q.link.match(/\/question\/(\d+)/);
        if (!qMatch) continue;
        const detail = await scrapeQuestion(page, `https://www.zhihu.com/question/${qMatch[1]}`, 10);
        detail.searchKeyword = q.keyword;
        detail.searchGroup = q.group;
        output.details[q.link] = detail;
      } catch (e) { console.log(`  ❌ ${e.message}`); }
      await new Promise(r => setTimeout(r, 2500));
    }
    
    for (const c of columns.slice(0, 8)) {
      try {
        const detail = await scrapeColumn(page, c.link);
        detail.searchKeyword = c.keyword;
        detail.searchGroup = c.group;
        output.details[c.link] = detail;
      } catch (e) { console.log(`  ❌ ${e.message}`); }
      await new Promise(r => setTimeout(r, 2000));
    }
    
    // 保存
    const outFile = 'zhihu-structured.json';
    fs.writeFileSync(outFile, JSON.stringify(output, null, 2), 'utf-8');
    
    const qCount = Object.values(output.details).filter(d => d.type === 'question').length;
    const cCount = Object.values(output.details).filter(d => d.type === 'column').length;
    const aCount = Object.values(output.details)
      .filter(d => d.type === 'question')
      .reduce((s, d) => s + (d.answerCount || 0), 0);
    
    console.log('\n' + '═'.repeat(55));
    console.log('📊 汇总');
    console.log('═'.repeat(55));
    console.log(`  搜索去重: ${unique.length} 条`);
    console.log(`  问题详情: ${qCount} 个 → ${aCount} 个回答`);
    console.log(`  专栏详情: ${cCount} 篇`);
    console.log(`  📁 ${outFile}`);
    
  } catch (e) { console.error('❌', e.message); }
  
  await browser.close();
  console.log('\n✅ 完成');
})();
