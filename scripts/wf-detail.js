/**
 * wf-detail.js — Wanfang detail page metadata extraction
 *
 * Usage:
 *   node wf-detail.js --url "https://d.wanfangdata.com.cn/..."
 *   node wf-detail.js --url <url> [--mode launch|cdp] [--show]
 *
 * Flow:
 *   Navigate detail page → expand all collapsed sections → extract all metadata
 *   Returns unified JSON with all available fields regardless of resource type.
 */
import { launch } from './browser-launcher.js';
import { goto } from './navigator.js';

function opt(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const url = opt('--url', '');
const dlMode = opt('--mode', 'launch');
const cdpPort = parseInt(opt('--cdp-port', '9222'));
const browserType = opt('--browser', dlMode === 'cdp' ? 'chrome' : '');
const headless = !process.argv.includes('--show');

if (!url) {
  console.error('Usage: node wf-detail.js --url <wanfang-detail-url> [--mode launch|cdp] [--show]');
  process.exit(1);
}

(async () => {
  const launchOpts = { headless, mode: dlMode, port: cdpPort };
  if (browserType) launchOpts.browser = browserType;
  const { browser, page } = await launch(launchOpts);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    // ── Expand all collapsed sections ──
    await page.evaluate(() => {
      // Click "展开全部"/"更多"/"Show more" buttons
      const btns = document.querySelectorAll('a, button, span, div');
      for (const b of btns) {
        const txt = (b.textContent || '').trim();
        if (/展开|更多|全文|Show More|View More|Read More|👇/.test(txt)) {
          try { b.click(); } catch {}
        }
      }
      // Click PDF/document tabs that may hide content
      document.querySelectorAll('.tab, [class*=tab]').forEach(t => {
        if (/摘要|详情|信息|Abstract|Detail/i.test(t.textContent)) {
          try { t.click(); } catch {}
        }
      });
    });
    await new Promise(r => setTimeout(r, 1500));

    // ── Extract all metadata ──
    const result = await page.evaluate(() => {
      const raw = (document.body?.innerText || '').replace(/\t/g, ' ');

      // Extract ALL key-value pairs from the page
      const fields = {};

      // Common fields across all types
      const patterns = [
        // Title: appears after breadcrumb "> xxx > xxx >" — take the last segment
        ['title', /(?:首页|期刊导航|学位导航|会议导航|专利导航|科技报告导航|成果导航|标准导航|法规导航)[\s\S]*?>\s*(.+?)(?:\s*\n\s*(?:DOI|在线阅读|摘要|作者|刘|张|王|李|赵|陈|杨|周))/s, 1],
        // Clean breadcrumb: keep only the paper name
        ['title', /DOI[：:]\s*\S+\s*\n\s*([^\n]+)/, 1], // title on next line after DOI
        // DOI
        ['doi', /DOI[：:]\s*(10\.\S+)/, 1],
        // Authors
        ['authors', /作者[：:]\s*(.+?)(?:\s*\n\s*(?:北京|上海|机构|Author|单位|在线阅读|摘要|关键词))/s, 1],
        // Institution/affiliation
        ['institution', /([^\n]+(?:大学|学院|研究所|研究院|科学院|科学院|公司|中心)[^\n]*)/, 1],
        // Abstract
        ['abstract', /摘要[：:]\s*([\s\S]+?)(?:\n\s*(?:关键词|分类号|基金|资助|发表|在线|页数|授予|学科|导师|学位|语种|母体|会议|专利|申请|公开|主分类|报告|全文|编制|立项|成果|项目|标准|起草|归口|出版|发布|状态|强制|实施|开本|中国标准|国际标准|引用|采用|库别|发文|颁布|效力|时效|内容))/s, 1],
        // Keywords
        ['keywords', /关键词[：:]\s*(.+?)(?:\s*\n\s*(?:分类号|基金|资助|发表|在线|页数|授予|学科|导师|学位|语种|母体))/s, 1],
        // Classification
        ['classification', /分类号[：:]\s*(.+?)(?:\s*\n)/, 1],
        // Funding
        ['funding', /资助基金[：:]\s*(.+?)(?:\s*\n)/, 1],
        // Publication date
        ['pubDate', /(?:文献发表日期|发表日期|发布日期|颁布日期|在线出版日期)[：:]\s*(.+?)(?:\s*\n)/, 1],
        // Pages
        ['pages', /(?:页数|开本页数)[：:]\s*(.+?)(?:\s*\n)/, 1],
        // Degree (thesis)
        ['degree', /授予学位[：:]\s*(.+?)(?:\s*\n)/, 1],
        ['discipline', /学科专业[：:]\s*(.+?)(?:\s*\n)/, 1],
        ['advisor', /导师姓名[：:]\s*(.+?)(?:\s*\n)/, 1],
        ['degreeYear', /学位年度[：:]\s*(.+?)(?:\s*\n)/, 1],
        ['language', /语种[：:]\s*(.+?)(?:\s*\n)/, 1],
        // Conference
        ['conference', /母体文献[：:]\s*(.+?)(?:\s*\n)/, 1],
        ['conferenceName', /会议名称[：:]\s*(.+?)(?:\s*\n)/, 1],
        ['conferenceDate', /会议时间[：:]\s*(.+?)(?:\s*\n)/, 1],
        ['conferenceLocation', /会议地点[：:]\s*(.+?)(?:\s*\n)/, 1],
        ['conferenceHost', /主办单位[：:]\s*(.+?)(?:\s*\n)/, 1],
        // Patent
        ['patentType', /专利类型[：:]\s*(.+?)(?:\s*\n)/, 1],
        ['patentNumber', /申请\/专利号[：:]\s*(.+?)(?:\s*\n)/, 1],
        ['patentAppDate', /申请日期[：:]\s*(.+?)(?:\s*\n)/, 1],
        ['patentPubNumber', /公开\/公告号[：:]\s*(.+?)(?:\s*\n)/, 1],
        ['patentPubDate', /公开\/公告日[：:]\s*(.+?)(?:\s*\n)/, 1],
        ['patentApplicant', /申请\/专利权人[：:]\s*(.+?)(?:\s*\n)/, 1],
        ['patentInventor', /发明\/设计人[：:]\s*(.+?)(?:\s*\n)/, 1],
        ['patentAgent', /专利代理机构[：:]\s*(.+?)(?:\s*\n)/, 1],
        // Standard
        ['standardNumber', /标准编号[：:]\s*(.+?)(?:\s*\n)/, 1],
        ['standardType', /标准类型[：:]\s*(.+?)(?:\s*\n)/, 1],
        ['standardStatus', /状态[：:]\s*(.+?)(?:\s*\n)/, 1],
        ['standardDrafters', /起草人[：:]\s*(.+?)(?:\s*\n)/, 1],
        // Legal regulation
        ['lawLibrary', /库别名称[：:]\s*(.+?)(?:\s*\n)/, 1],
        ['lawNumber', /发文文号[：:]\s*(.+?)(?:\s*\n)/, 1],
        ['lawDept', /颁布部门[：:]\s*(.+?)(?:\s*\n)/, 1],
        ['lawLevel', /效力级别[：:]\s*(.+?)(?:\s*\n)/, 1],
        ['lawEffective', /时效性[：:]\s*(.+?)(?:\s*\n)/, 1],
        // Report
        ['reportType', /报告类型[：:]\s*(.+?)(?:\s*\n)/, 1],
        ['reportDate', /编制时间[：:]\s*(.+?)(?:\s*\n)/, 1],
        // Achievement
        ['achievementNumber', /项目年度编号[：:]\s*(.+?)(?:\s*\n)/, 1],
        ['achievementCategory', /成果类别[：:]\s*(.+?)(?:\s*\n)/, 1],
        // Misc
        ['onlineDate', /在线出版日期[：:]\s*(.+?)(?:\s*\n)/, 1],
        ['isbn', /ISBN[：:]\s*(.+?)(?:\s*\n)/, 1],
        ['source', /来源[：:]\s*(.+?)(?:\s*\n)/, 1],
      ];

      for (const [key, pattern, group] of patterns) {
        if (fields[key]) continue; // don't overwrite
        const m = raw.match(pattern);
        if (m && m[group]) {
          const val = m[group].trim();
          if (val.length > 1 && val.length < 2000 && !val.includes('\n\n\n')) {
            fields[key] = val;
          }
        }
      }

      // Download availability — check if page contains download action buttons
      const hasFullText = /整篇下载/.test(raw);
      const hasChapter = /分章下载/.test(raw);
      const hasBasic = /[^\u4e00-\u9fa5]下载[^\u4e00-\u9fa5]/.test(raw) || /\b下载\s/.test(raw);
      const viewOnly = /在线阅读/.test(raw) && !hasFullText && !hasBasic;

      // Detect resource type from URL
      const href = location.href;
      let resourceType = 'unknown';
      if (href.includes('/thesis/')) resourceType = 'thesis';
      else if (href.includes('/periodical/')) resourceType = 'periodical';
      else if (href.includes('/conference/')) resourceType = 'conference';
      else if (href.includes('/patent/')) resourceType = 'patent';
      else if (href.includes('/nstr/')) resourceType = 'nstr';
      else if (href.includes('/cstad/')) resourceType = 'cstad';
      else if (href.includes('/standard/')) resourceType = 'standard';
      else if (href.includes('/claw/')) resourceType = 'claw';

      // Clean title: remove breadcrumb prefix, keep only the paper name
      let title = fields.title || '';
      if (title.includes(' > ')) {
        const parts = title.split(' > ');
        title = parts[parts.length - 1].split('\n')[0].trim();
      }
      fields.title = title;

      return {
        url: href,
        resourceType,
        title: fields.title || '',
        download: { hasFullText, hasChapter, hasBasic, viewOnly },
        fields,
      };
    });

    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.log(JSON.stringify({ error: e.message }, null, 2));
  }

  if (dlMode === 'cdp') {
    try { browser.close(); } catch {}
    process.exit(0);
  } else {
    await browser.close();
  }
})();
