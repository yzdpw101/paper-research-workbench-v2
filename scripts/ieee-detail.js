/**
 * ieee-detail.js — IEEE Xplore detail page metadata extraction
 *
 * Usage:
 *   node ieee-detail.js --arnumber <n>
 *
 * Extracts metadata only: abstract, authors, DOI, keywords, references, citation count.
 * Does NOT extract full paper text — download PDF and use PyMuPDF for that.
 */

import { launch } from './browser-launcher.js';
import { goto } from './navigator.js';

function opt(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const arnumber = opt('--arnumber', '');

if (!arnumber) {
  console.error('Usage: node ieee-detail.js --arnumber <n>');
  process.exit(1);
}

(async () => {
  const { browser, page } = await launch({ headless: true });

  const detailUrl = 'https://ieeexplore.ieee.org/document/' + arnumber + '/';
  await goto(page, detailUrl, { timeout: 60000, waitFor: 'h1' });

  // Click "Show More" buttons to expand truncated content
  await page.evaluate(() => {
    document.querySelectorAll('[class*=abstract] button, .show-more, [class*=expand], [class*=ShowMore], button').forEach(b => {
      const t = (b.textContent || '').trim();
      if (/show more|view more|read more/i.test(t)) b.click();
    });
  });
  // Wait for expanded content to render
  await new Promise(resolve => setTimeout(resolve, 1000));

  const result = await page.evaluate(() => {
    const raw = (document.body?.innerText || '');
    const b = raw.replace(/[\s]+/g, ' ');

    const accessReady = /\bSign Out\b/i.test(b) || /Access provided by/i.test(b);
    if (!accessReady) return { accessReady, error: 'not logged in', warning: '未检测到登录态（可能是校园网IP认证，不影响使用）' };

    let title = (document.querySelector('h1')?.textContent || '').trim().replace(/\s+/g, ' ');
    if (!title || title.length < 10) {
      const tm = b.match(/ADVANCED SEARCH[\s\S]*?>([^>]+?)Publisher:\s*IEEE/);
      title = tm ? tm[1].trim().replace(/\s*>\s*$/, '') : '';
    }

    const am = b.match(/Cite This\s*PDF\s+(.+?)All Authors/);
    const authors = am ? am[1].trim().split(';').map(s => s.trim()).filter(s => s.length > 2 && !s.includes('All')) : [];

    const absM = b.match(/Abstract:\s*([\s\S]+?)(?:Published in:|Date of Conference:|Date of\b|DOI:|Publisher:|Show More)/i);
    const abstract = absM ? absM[1].trim() : '';

    const pubM = b.match(/Published in:\s*(.+?)(?:\s+Date of|\s+DOI:|\s+Publisher:)/);
    const publishedIn = pubM ? pubM[1].trim() : '';

    const dateM = b.match(/Date of Conference:\s*(.+?)(?:\s+DOI|\s+Date Added|\s+Publisher|\s+INSPEC)/);
    const pubDate = dateM ? dateM[1].trim() : '';

    const doiM = b.match(/DOI:\s*(10\.\d+\/[^\s]+)/);
    const doi = doiM ? doiM[1] : '';

    const authKW = raw.match(/Author Keywords\s*\n([\s\S]*?)(?:\nIEEE Keywords|\nMetrics)/);
    const ieeeKW = raw.match(/IEEE Keywords\s*\n([\s\S]*?)(?:\nMetrics|\nAdvertisement)/);

    const refMatch = raw.match(/\nReferences\s*\n([\s\S]*?)(?:\nFigures|\nKeywords|\nFootnotes|\nRelated|\nCited|\nMetrics|\nPublished in)/i);
    const references = refMatch ? refMatch[1].trim().split(/\n\d+\.?\s+/).filter(r => r.length > 10).slice(0, 10) : [];

    const citedM = b.match(/Cited by:\s*(\d+)/i);
    const citedBy = citedM ? parseInt(citedM[1]) : 0;

    return {
      accessReady,
      title, arnumber: (new URL(location.href)).pathname.match(/\/document\/(\d+)/)?.[1] || '',
      authors: authors.slice(0, 10),
      abstract,
      publishedIn, pubDate, doi, citedBy,
      keywords: {
        author: authKW ? authKW[1].trim().replace(/\n/g, ', ') : '',
        ieee: ieeeKW ? ieeeKW[1].trim().replace(/\n/g, ', ') : ''
      },
      references: references.slice(0, 10)
    };
  });

  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
