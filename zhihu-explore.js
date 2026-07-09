import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const page = browser.contexts()[0].pages()[0] || await browser.contexts()[0].newPage();

// ============================================================
// 1. 探索搜索类型
// ============================================================
const searchTypes = [
  { name: 'content', url: 'https://www.zhihu.com/search?type=content&q=嵌入式' },
  { name: 'question', url: 'https://www.zhihu.com/search?type=question&q=嵌入式' },
  { name: 'column', url: 'https://www.zhihu.com/search?type=column&q=嵌入式' },
  { name: 'topic', url: 'https://www.zhihu.com/search?type=topic&q=嵌入式' },
  { name: 'people', url: 'https://www.zhihu.com/search?type=people&q=嵌入式' },
  { name: 'no-type', url: 'https://www.zhihu.com/search?q=嵌入式' },
];

console.log('=== 探索搜索类型 ===\n');
for (const st of searchTypes) {
  await page.goto(st.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));
  
  const info = await page.evaluate(() => {
    // 看有哪些结果卡片类型
    const cardClasses = new Set();
    document.querySelectorAll('[class*="List"] [class*="item"], [class*="Card"], [class*="Result"]').forEach(el => {
      cardClasses.add(el.className?.split(' ')[0] || el.tagName);
    });
    
    // 数结果数
    const count = document.querySelectorAll('[class*="List-item"], [class*="Card"], [class*="Result"]').length;
    
    // 看每个结果的 link 类型
    const linkTypes = {};
    document.querySelectorAll('a[href*="zhihu.com"]').forEach(a => {
      const h = a.href;
      if (h.includes('/question/')) linkTypes.question = (linkTypes.question||0)+1;
      if (h.includes('/answer/')) linkTypes.answer = (linkTypes.answer||0)+1;
      if (h.includes('/p/')) linkTypes.column = (linkTypes.column||0)+1;
      if (h.includes('/topic/')) linkTypes.topic = (linkTypes.topic||0)+1;
    });
    
    return { count, cardTypes: [...cardClasses].slice(0,10), linkTypes };
  });
  
  console.log(`type=${st.name.padEnd(10)} | ${info.count} 结果 | links: ${JSON.stringify(info.linkTypes)}`);
  console.log(`  cards: ${info.cardTypes.join(', ')}`);
}

// ============================================================
// 2. 探索问题页结构 vs 专栏页结构
// ============================================================
console.log('\n=== 探索页面结构 ===\n');

// 2a. 问题页（多回答）
console.log('--- 问题页（多回答）---');
await page.goto('https://www.zhihu.com/question/613083643', { waitUntil: 'domcontentloaded', timeout: 15000 });
await new Promise(r => setTimeout(r, 3000));

const questionStructure = await page.evaluate(() => {
  // 问题标题
  const qTitle = document.querySelector('.QuestionHeader-title')?.textContent?.trim() || 
                 document.querySelector('h1')?.textContent?.trim() || '';
  
  // 回答容器
  const answerSelectors = ['.List-item', '.AnswerItem', '[class*="AnswerItem"]'];
  let answers = [];
  for (const sel of answerSelectors) {
    answers = document.querySelectorAll(sel);
    if (answers.length > 0) break;
  }
  
  // 每个回答的结构
  const sample = [];
  answers.forEach((a, i) => {
    if (i >= 2) return;
    const author = a.querySelector('[class*="Author"], [class*="author"], [class*="name"]')?.textContent?.trim()?.slice(0,30) || '';
    const content = a.querySelector('.RichText, [class*="content"]')?.textContent?.trim()?.slice(0,100) || '';
    const votes = a.querySelector('[class*="vote"], [class*="Vote"]')?.textContent?.trim() || '';
    const comments = a.querySelector('[class*="comment"]')?.textContent?.trim() || '';
    
    // 这个回答里的关键 class
    const keyClasses = [];
    a.querySelectorAll('[class]').forEach(el => {
      const cls = el.className;
      if (typeof cls === 'string' && (cls.includes('vote') || cls.includes('comment') || cls.includes('author') || cls.includes('content'))) {
        keyClasses.push(cls.split(' ')[0]);
      }
    });
    
    sample.push({ author, votes, comments, content_preview: content, classes: [...new Set(keyClasses)].slice(0,10) });
  });
  
  return { qTitle, answerCount: answers.length, sample };
});

console.log(`  标题: ${questionStructure.qTitle}`);
console.log(`  回答数: ${questionStructure.answerCount}`);
for (const s of questionStructure.sample) {
  console.log(`  ├─ 作者: ${s.author} | 赞: ${s.votes} | 评论: ${s.comments}`);
  console.log(`  │  classes: ${s.classes.join(', ')}`);
  console.log(`  │  内容: ${s.content_preview}...`);
}

// 2b. 专栏页（单篇）
console.log('\n--- 专栏页（单篇）---');
await page.goto('https://zhuanlan.zhihu.com/p/2019180996877121015', { waitUntil: 'domcontentloaded', timeout: 15000 });
await new Promise(r => setTimeout(r, 3000));

const columnStructure = await page.evaluate(() => {
  const title = document.querySelector('.Post-Title, h1')?.textContent?.trim() || '';
  const author = document.querySelector('.AuthorInfo-name, [class*="Author"]')?.textContent?.trim() || '';
  const content = document.querySelector('.RichText, article, .Post-RichText')?.textContent?.trim()?.slice(0,200) || '';
  const votes = document.querySelector('[class*="vote"], [class*="like"]')?.textContent?.trim() || '';
  const comments = document.querySelector('[class*="comment"]')?.textContent?.trim() || '';
  
  const keyClasses = [];
  document.querySelectorAll('[class]').forEach(el => {
    const cls = el.className;
    if (typeof cls === 'string' && (cls.includes('Post') || cls.includes('vote') || cls.includes('comment') || cls.includes('Author'))) {
      keyClasses.push(cls.split(' ')[0]);
    }
  });
  
  return { title, author, votes, comments, content_preview: content, classes: [...new Set(keyClasses)].slice(0,15) };
});

console.log(`  标题: ${columnStructure.title}`);
console.log(`  作者: ${columnStructure.author}`);
console.log(`  赞: ${columnStructure.votes} | 评论: ${columnStructure.comments}`);
console.log(`  classes: ${columnStructure.classes.join(', ')}`);
console.log(`  内容: ${columnStructure.content_preview}...`);

// 2c. 单回答直达页
console.log('\n--- 单回答直达页 ---');
await page.goto('https://www.zhihu.com/question/613083643/answer/3488686699', { waitUntil: 'domcontentloaded', timeout: 15000 });
await new Promise(r => setTimeout(r, 3000));

const singleAnswer = await page.evaluate(() => {
  const qTitle = document.querySelector('.QuestionHeader-title, h1')?.textContent?.trim() || '';
  const author = document.querySelector('[class*="Author"], [class*="author"]')?.textContent?.trim()?.slice(0,30) || '';
  const content = document.querySelector('.RichText, [class*="AnswerItem"] .RichText')?.textContent?.trim()?.slice(0,200) || '';
  
  // 看看有没有其他回答的推荐
  const otherAnswers = document.querySelectorAll('[class*="AnswerItem"], .List-item').length;
  
  return { qTitle, author, content_preview: content, otherAnswersVisible: otherAnswers };
});

console.log(`  问题: ${singleAnswer.qTitle}`);
console.log(`  作者: ${singleAnswer.author}`);
console.log(`  可见其他回答: ${singleAnswer.otherAnswersVisible}`);
console.log(`  内容: ${singleAnswer.content_preview}...`);

await browser.close();
console.log('\n✅ 探索完成');
