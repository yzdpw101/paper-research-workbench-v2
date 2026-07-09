import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const page = browser.contexts()[0].pages()[0] || await browser.contexts()[0].newPage();

// ============================================================
// 深度探索搜索结果卡片结构
// ============================================================
await page.goto('https://www.zhihu.com/search?type=content&q=嵌入式开发学习路线', { waitUntil: 'domcontentloaded', timeout: 15000 });
await new Promise(r => setTimeout(r, 3000));

// 滚动加载
for (let i = 0; i < 3; i++) {
  await page.evaluate(() => window.scrollBy(0, 600));
  await new Promise(r => setTimeout(r, 800));
}

console.log('=== 搜索结果卡片深度结构 ===\n');

const cardDetail = await page.evaluate(() => {
  const cards = document.querySelectorAll('.List-item');
  const results = [];
  
  cards.forEach((card, idx) => {
    if (idx >= 3) return; // 只看前3个
    
    // 所有 a 标签
    const allLinks = [];
    card.querySelectorAll('a').forEach(a => {
      allLinks.push({ text: a.textContent?.trim()?.slice(0,50), href: a.href?.slice(0,120), class: a.className });
    });
    
    // 标题元素
    const titleEls = [];
    card.querySelectorAll('h1,h2,h3,h4,span,div').forEach(el => {
      const cls = (typeof el.className === 'string') ? el.className : '';
      if (cls.includes('title') || cls.includes('Title') || cls.includes('header') || cls.includes('Header')) {
        titleEls.push({ tag: el.tagName, class: cls.split(' ')[0], text: el.textContent?.trim()?.slice(0,80) });
      }
    });
    
    // 摘要/描述
    const descEls = [];
    card.querySelectorAll('[class*="RichText"], [class*="excerpt"], [class*="summary"], [class*="description"], [class*="content"]').forEach(el => {
      if (el.textContent?.trim().length > 10) {
        descEls.push({ class: (typeof el.className === 'string') ? el.className.split(' ')[0] : '', text: el.textContent.trim().slice(0,100) });
      }
    });
    
    // meta信息
    const metaTexts = [];
    card.querySelectorAll('[class*="meta"], [class*="footer"], [class*="info"]').forEach(el => {
      metaTexts.push({ class: (typeof el.className === 'string') ? el.className.split(' ')[0] : '', text: el.textContent?.trim()?.slice(0,100) });
    });
    
    // 这个卡片内可见的所有文本（前200字）
    const fullText = card.textContent?.trim()?.slice(0,300);
    
    results.push({ 
      idx, 
      linkCount: allLinks.length,
      links: allLinks.slice(0, 5),
      titles: titleEls.slice(0, 5),
      descriptions: descEls.slice(0, 3),
      metas: metaTexts.slice(0, 3),
      fullText: fullText
    });
  });
  
  return results;
});

for (const r of cardDetail) {
  console.log(`--- 卡片 #${r.idx} ---`);
  console.log(`  links(${r.linkCount}):`);
  r.links.forEach(l => console.log(`    [${l.class.slice(0,30)}] ${l.text} → ${l.href}`));
  console.log(`  titles:`);
  r.titles.forEach(t => console.log(`    <${t.tag}.${t.class}> ${t.text}`));
  console.log(`  descriptions:`);
  r.descriptions.forEach(d => console.log(`    .${d.class}: ${d.text}`));
  console.log(`  metas:`);
  r.metas.forEach(m => console.log(`    .${m.class}: ${m.text}`));
  console.log(`  fullText preview: ${r.fullText?.slice(0,150)}...`);
  console.log();
}

// ============================================================
// 探索问题页 - 如何获取所有回答
// ============================================================
console.log('=== 问题页 - 获取所有回答 ===\n');

await page.goto('https://www.zhihu.com/question/613083643', { waitUntil: 'domcontentloaded', timeout: 15000 });
await new Promise(r => setTimeout(r, 3000));

// 先看答案总数
const answerInfo = await page.evaluate(() => {
  // 答案总数一般在哪里
  const headerText = document.querySelector('.QuestionHeader, .QuestionAnswers-answers')?.textContent?.trim()?.slice(0,200) || '';
  const answerCountEl = document.querySelector('[class*="answers"], [class*="Answers"], [class*="List-header"]');
  const answerCountText = answerCountEl?.textContent?.trim() || '';
  
  // 实际可见的回答数
  const visibleAnswers = document.querySelectorAll('.List-item, [class*="AnswerItem"]').length;
  
  return { headerText, answerCountText, visibleAnswers };
});

console.log(`  header: ${answerInfo.headerText}`);
console.log(`  回答数: ${answerInfo.answerCountText}`);
console.log(`  可见: ${answerInfo.visibleAnswers}`);

// 滚动加载更多回答
for (let i = 0; i < 15; i++) {
  await page.evaluate(() => window.scrollBy(0, 800));
  await new Promise(r => setTimeout(r, 600));
  
  const count = await page.evaluate(() => document.querySelectorAll('.List-item, [class*="AnswerItem"]').length);
  if (i % 3 === 0) console.log(`  滚动${i+1}次后可见: ${count} 个回答`);
}

// 最终看能拿到多少个回答的详情
const finalAnswers = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('.List-item, [class*="AnswerItem"]')).slice(0, 10).map((item, i) => {
    const author = item.querySelector('[class*="AuthorInfo-name"], [class*="authorName"]')?.textContent?.trim() || '';
    const authorLink = item.querySelector('a[href*="/people/"]')?.href || '';
    const answerLink = item.querySelector('a[href*="/answer/"]')?.href || '';
    const content = item.querySelector('.RichText')?.textContent?.trim()?.slice(0, 200) || '';
    const votes = item.querySelector('[class*="Vote"], [class*="vote"] button, [class*="VoteButton"]')?.textContent?.trim() || '';
    const commentCount = item.querySelector('[class*="comments"] button, [class*="Comment"] button')?.textContent?.trim() || '';
    
    // 评论区域
    const commentItems = [];
    item.querySelectorAll('[class*="CommentItem"], [class*="comment-item"]').forEach(ci => {
      const cAuthor = ci.querySelector('[class*="author"], [class*="name"]')?.textContent?.trim() || '';
      const cText = ci.textContent?.trim()?.slice(0,100) || '';
      if (cAuthor) commentItems.push({ author: cAuthor, text: cText });
    });
    
    return { 
      idx: i, 
      author: author.slice(0,30), 
      authorLink, 
      answerLink, 
      votes, 
      commentCount,
      comments: commentItems.slice(0,3),
      content_preview: content.slice(0,200) 
    };
  });
});

console.log(`\n  最终获取到 ${finalAnswers.length} 个回答:\n`);
for (const a of finalAnswers) {
  console.log(`  ┌─ #${a.idx} 作者: ${a.author} | 赞: ${a.votes} | 评论: ${a.commentCount}`);
  console.log(`  │  回答链接: ${a.answerLink}`);
  console.log(`  │  内容: ${a.content_preview?.slice(0,100)}...`);
  if (a.comments.length > 0) {
    console.log(`  │  评论(${a.comments.length}):`);
    a.comments.forEach(c => console.log(`  │    └ ${c.author}: ${c.text.slice(0,80)}`));
  }
  console.log(`  └─`);
}

await browser.close();
console.log('\n✅ 探索完成');
