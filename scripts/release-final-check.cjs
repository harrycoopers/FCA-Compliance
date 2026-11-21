'use strict';
/*
 * Final pre-release gate. Run from the repository root after `npm run build`:
 *   node scripts/release-final-check.cjs
 * Exits non-zero if any check fails, including when any public page still contains
 * "[CONFIRM", "[VERIFY" or "{{", or config/release.js still holds its placeholder date.
 * Starts the real app in-process on an isolated temporary database; sends no email,
 * bookings or external requests. Browser checks use .qa/node_modules/playwright-core
 * (override with PLAYWRIGHT_MODULE); external browser traffic is blocked.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const root = path.join(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), '009-release-check-'));
delete process.env.NODE_ENV; delete process.env.BASE_URL; delete process.env.RELEASE_DATE_PREVIEW;
process.env.DB_PATH = path.join(temp, 'check.sqlite');
process.env.SESSION_SECRET = 'isolated-release-check-only-' + 'x'.repeat(32);
process.env.CANONICAL_BASE_URL = 'https://009compliance.com';
for (const key of Object.keys(process.env)) if (/^(GOOGLE_|SMTP_|BOOKING_)/.test(key)) delete process.env[key];
const load = Module._load;
Module._load = function (id, parent) {
  if (id === 'dotenv') return { config: () => ({}) };
  if (id === './utils/email' && parent.filename.endsWith('server.js')) return { sendEmail: async () => {} };
  return load.apply(this, arguments);
};
const app = require('../server');
Module._load = load;
const pages = require('../config/seo-pages.json');
const guides = require('../config/guide-content.json');
const release = require('../config/release');
const campaign = require('../config/campaign');
const offer = require('../config/offer');
const offerLinks = require('../config/guide-offer-links.json');
const before = require('../docs/release-final-2026-11/registry-before.json');
const beforeGuides = require('../docs/release-final-2026-11/content-before.json');

const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass: Boolean(pass), detail }); };
const decode = s => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const schemasFrom = html => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
// 009 Compliance's own prices (config/offer.js). FCA fees and regulatory thresholds are allowed.
const ownPrices = [...new Set([offer.startPayment, offer.monthlyPayment, offer.minimumTotal.amount, offer.reportingMonthly])].map(n => n.toLocaleString('en-GB'));
const ownPrice = new RegExp('£\\s?(?:' + ownPrices.map(p => p.replace(',', ',')).join('|') + ')(?![\\d,])');
const changedPages = new Set(Object.keys(pages).filter(p => !before[p] || before[p].title !== pages[p].title || before[p].description !== pages[p].description));
const fcaGuides = Object.keys(guides).filter(p => guides[p].group === 'fca' && !offerLinks.bannerExcluded.includes(p));

(async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const get = async url => { const r = await fetch(base + url, { redirect: 'manual' }); return { status: r.status, location: r.headers.get('location'), text: await r.text() }; };
  const html = {};
  try {
    process.env.CAMPAIGN_NOW = '2026-11-21T12:00:00Z';
    for (const url of Object.keys(pages)) html[url] = (await get(url)).text;
    const extra = { '/sitemap.xml': (await get('/sitemap.xml')).text, '/llms.txt': (await get('/llms.txt')).text };

    // 1. Release gate: placeholders and release date.
    const markers = [];
    for (const [url, text] of Object.entries({ ...html, ...extra })) for (const marker of ['[CONFIRM', '[VERIFY', '{{']) {
      let at = text.indexOf(marker);
      while (at >= 0) { markers.push({ url, marker, excerpt: decode(text.slice(at, text.indexOf(']', at) + 1 || at + 120)).slice(0, 160) }); at = text.indexOf(marker, at + 1); }
    }
    check('No [CONFIRM, [VERIFY or {{ in public pages, sitemap or llms.txt', markers.length === 0, markers.length + ' found');
    check('RELEASE_DATE set to a real date (config/release.js)', release.isDate(release.RELEASE_DATE), 'value: ' + release.RELEASE_DATE);

    // 2. Unique metadata and H1s.
    const field = (re, text) => decode((text.match(re) || [])[1] || '');
    const meta = Object.fromEntries(Object.entries(html).map(([url, t]) => [url, {
      title: field(/<title>([\s\S]*?)<\/title>/, t), description: field(/<meta name="description" content="([^"]*)"/, t), h1: field(/<h1\b[^>]*>([\s\S]*?)<\/h1>/, t), h1s: (t.match(/<h1\b/g) || []).length }]));
    for (const key of ['title', 'description', 'h1']) {
      const seen = {}; for (const [url, m] of Object.entries(meta)) (seen[m[key]] = seen[m[key]] || []).push(url);
      const dups = Object.entries(seen).filter(([v, urls]) => !v || urls.length > 1);
      check('No duplicate or empty ' + key + 's', dups.length === 0, dups.map(([v, u]) => `"${v}": ${u.join(', ')}`).join('; '));
    }
    check('Exactly one H1 per public page', Object.values(meta).every(m => m.h1s === 1));
    const long = Object.entries(meta).filter(([url, m]) => m.description.length > 155);
    check('Meta descriptions ≤155 characters on pages changed in this release', long.filter(([url]) => changedPages.has(url)).length === 0, long.filter(([u]) => changedPages.has(u)).map(([u, m]) => u + ' ' + m.description.length).join('; '));
    results.push({ name: 'Pre-existing descriptions over 155 characters (not changed in this release; informational)', pass: true, info: true, detail: long.filter(([u]) => !changedPages.has(u)).map(([u, m]) => u + ' ' + m.description.length).join('; ') || 'none' });

    // 3. Internal links resolve (paths and fragments).
    const targets = new Set();
    for (const t of Object.values(html)) for (const m of t.matchAll(/href="(\/[^"#?]*)(?:\?[^"#]*)?(#[^"]*)?"/g)) if (!/^\/(?:build|css|js|fonts|images)\//.test(m[1])) targets.add(m[1] + (m[2] || ''));
    const broken = [];
    for (const target of targets) {
      const [p, frag] = target.split('#');
      let r = await get(p); if (r.status === 301 || r.status === 302) r = await get(new URL(r.location, base).pathname);
      if (r.status !== 200) broken.push(target + ' → ' + r.status);
      else if (frag && !new RegExp('id="' + frag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"').test(r.text)) broken.push(target + ' (missing #' + frag + ')');
    }
    check('All internal links resolve, including new guide links and fragments', broken.length === 0, targets.size + ' unique targets; ' + (broken.join('; ') || 'none broken'));
    const newGuides = Object.keys(guides).filter(p => !beforeGuides[p]);
    check('New guides return 200 and are in /guides, sitemap (with lastmod) and llms.txt', newGuides.every(p => html[p] && html['/guides'].includes('href="' + p + '"') && extra['/sitemap.xml'].includes('<loc>https://009compliance.com' + p + '</loc><lastmod>') && extra['/llms.txt'].includes('https://009compliance.com' + p + ')')), newGuides.join(', '));

    // 4. FAQ schema parity and no 009 prices in openings/FAQs/FAQ schema.
    const faqIssues = [], priceIssues = [];
    for (const url of Object.keys(guides)) {
      const t = html[url];
      const visible = [...t.matchAll(/<details class="ccr009-faq__item"><summary>([\s\S]*?)<\/summary><p class="services-p">([\s\S]*?)<\/p>/g)].map(m => [decode(m[1]), decode(m[2])]);
      const schema = schemasFrom(t).filter(s => s['@type'] === 'FAQPage');
      const marked = schema[0] ? schema[0].mainEntity.map(q => [q.name, q.acceptedAnswer.text]) : [];
      if (schema.length !== 1 || JSON.stringify(visible) !== JSON.stringify(marked)) faqIssues.push(url);
      const opening = decode((t.match(/<p class="ccr009-hero__lead guide-answer">([\s\S]*?)<\/p>/) || [])[1] || '');
      for (const [where, text] of [['opening', opening], ['FAQs', JSON.stringify(visible)], ['FAQ schema', JSON.stringify(marked)]]) if (ownPrice.test(text)) priceIssues.push(url + ' ' + where);
    }
    check('FAQPage JSON-LD matches the visible FAQs on every guide', faqIssues.length === 0, faqIssues.join(', ') || Object.keys(guides).length + ' guides');
    check('No 009 Compliance prices (' + ownPrices.map(p => '£' + p).join(', ') + ') in guide openings, FAQs or FAQ schema', priceIssues.length === 0, priceIssues.join(', ') || 'FCA fees and regulatory thresholds allowed');
    // A sentence that states a £ figure and mentions a fee is treated as an FCA fee figure.
    const feeSentences = url => JSON.stringify(guides[url]).split(/[.":]/).filter(s => /£\s?\d/.test(s) && /fees?/i.test(s) && !ownPrice.test(s));
    const feeNoteIssues = Object.keys(guides).filter(url => feeSentences(url).length && !/FCA (?:fees|guidance) checked <time/.test(html[url]));
    check('FCA fee figures carry an "FCA fees/guidance checked [date]" note with an FCA link', feeNoteIssues.length === 0, feeNoteIssues.join(', ') || 'cost guide, CCR007 guide');

    // 5. Offer placements and anchors.
    const placement = [], anchorIssues = [], used = new Set();
    for (const url of Object.keys(guides)) {
      const t = html[url], g = guides[url];
      // Guide content area: main column (including offer panels) and the guide sidebar; excludes site header/footer menus.
      const content = t.slice(t.indexOf('<div class="ccr009-content">'), t.indexOf('</aside>', t.indexOf('<aside class="ccr009-aside"')));
      const banners = (t.match(/data-compact-offer\b/g) || []).length, panels = (t.match(/<section class="guide-original-offer"/g) || []).length;
      if (fcaGuides.includes(url)) {
        const s1 = t.indexOf('id="guide-section-1"'), s2 = t.indexOf('id="guide-section-2"'), b = t.indexOf('data-compact-offer');
        if (banners !== 1 || panels !== 1 || !(b > s1 && b < s2) || t.indexOf('<section class="guide-original-offer"') < t.indexOf('id="guide-sources"')) placement.push(url + ` banner=${banners} panel=${panels}`);
        const aside = (t.match(/<aside class="guide-offer-banner[\s\S]*?<\/aside>/) || [''])[0];
        if (/<h[1-6]\b/.test(aside) || !/<p class="guide-offer-banner__text">/.test(aside)) placement.push(url + ' banner heading/text');
      } else {
        if (banners || panels) placement.push(url + ' unexpected FCA offer');
        if (g.group === 'ccr') {
          const block = (t.match(/<section class="guide-offer offer-wrap"[\s\S]*?<\/section>/) || [''])[0];
          if (!block.includes('Help preparing your CCR009 return') || (block.match(/href="\/fca-authorisation-motor-dealers"/g) || []).length !== 1 || /£/.test(block)) placement.push(url + ' CCR009 CTA/text link');
        }
      }
      for (const m of content.matchAll(/<a\b[^>]*href="\/fca-authorisation-motor-dealers"[^>]*>([\s\S]*?)<\/a>/g)) {
        const text = decode(m[1]).replace(/\s*→$/, '');
        const anchor = offerLinks.anchors.find(a => a.toLowerCase() === text.toLowerCase());
        if (!anchor) anchorIssues.push(url + ': "' + text + '"'); else used.add(anchor);
      }
    }
    check('FCA authorisation guides: one compact banner after the first section plus the full panel after the article; none elsewhere', placement.length === 0, placement.join('; ') || fcaGuides.length + ' FCA guides');
    check('CCR009 guides keep the CCR009 CTA primary with one small text link to the FCA offer page', !placement.some(p => p.includes('CCR009')));
    check('Every guide link to /fca-authorisation-motor-dealers uses a rotated descriptive anchor', anchorIssues.length === 0 && used.size === offerLinks.anchors.length, anchorIssues.join('; ') || 'anchors used: ' + [...used].join(' | '));
    check('No "click here" anchors on public pages', !Object.values(html).some(t => /click here/i.test(t)));
    const thousand = Object.keys(html).filter(url => /£1,?000(?![\d,])/.test(html[url]));
    check('No public page HTML contains "£1,000" or "£1000"', thousand.length === 0, thousand.join(', ') || 'none');
    // Vague anchors in the page content (main, including asides; site menus inside <nav> are excluded).
    const vague = [];
    for (const [url, t] of Object.entries(html)) {
      const main = (t.match(/<main\b[\s\S]*<\/main>/) || [''])[0].replace(/<nav\b[\s\S]*?<\/nav>/g, '');
      for (const m of main.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)) {
        const text = decode(m[1]).replace(/[↗→↓←↑]/g, '').trim();
        if (/^(learn more|read more|click here|more)$/i.test(text)) vague.push(url + ': "' + text + '"');
      }
    }
    check('No vague anchors ("learn more", "read more", "click here", "more") in main or aside', vague.length === 0, vague.join('; ') || 'none');
    // Any page showing an FCA fee figure must carry the "FCA fees checked" note.
    const feeFigure = Object.keys(html).filter(url => /£\s?(?:560|1,100)\b/.test(decode(html[url])) && !/FCA fees checked/.test(decode(html[url])));
    check('Pages showing "£560" or "£1,100" also show "FCA fees checked"', feeFigure.length === 0, feeFigure.join(', ') || 'offer page, /pricing, cost guide');

    // 6. Campaign fallback when the date is mocked to 26 December 2026.
    const fallback = [];
    for (const mode of ['continue', 'unconfirmed', 'custom']) {
      const previous = campaign.postCampaign.mode; campaign.postCampaign.mode = mode; process.env.CAMPAIGN_NOW = '2026-12-26T00:00:01Z';
      try {
        for (const url of fcaGuides) {
          const t = (await get(url)).text, aside = (t.match(/<aside class="guide-offer-banner[\s\S]*?<\/aside>/) || [''])[0];
          if (!aside || /Christmas|closes|is-festive/i.test(aside)) fallback.push(mode + ' ' + url + ' festive copy');
          if (mode === 'continue' && !(aside.includes('Monthly subscription') && aside.includes(offer.qualifier))) fallback.push(mode + ' ' + url + ' price');
          if (mode !== 'continue' && /£/.test(aside)) fallback.push(mode + ' ' + url + ' price leak');
        }
      } finally { campaign.postCampaign.mode = previous; }
    }
    process.env.CAMPAIGN_NOW = '2026-11-21T12:00:00Z';
    check('Offer fallback renders when the date is mocked to 26 Dec 2026 (continue, unconfirmed, custom)', fallback.length === 0, fallback.join('; ') || fcaGuides.length * 3 + ' renders');

    // 7. Browser: reduced motion and no layout shift from the banner.
    let chromium;
    try { ({ chromium } = require(process.env.PLAYWRIGHT_MODULE || path.join(root, '.qa/node_modules/playwright-core'))); } catch { chromium = null; }
    if (!chromium) check('Browser checks (reduced motion, CLS)', false, 'playwright-core not available');
    else {
      const browser = await chromium.launch({ headless: true });
      const motion = [], shifts = [];
      try {
        for (const url of [fcaGuides[0], '/fca-authorisation-cost-car-dealers', '/van-commercial-vehicle-dealers-fca-permissions']) for (const width of [1280, 390]) for (const reduced of [false, true]) {
          const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
          await context.route('**/*', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
          const page = await context.newPage();
          await page.addInitScript(() => { window.__shifts = []; new PerformanceObserver(list => { for (const e of list.getEntries()) window.__shifts.push({ value: e.value, recent: e.hadRecentInput, nodes: (e.sources || []).map(s => s.node && s.node.className ? String(s.node.className) : '') }); }).observe({ type: 'layout-shift', buffered: true }); });
          await page.goto(base + url, { waitUntil: 'networkidle' });
          const banner = page.locator('[data-compact-offer]');
          await banner.scrollIntoViewIfNeeded();
          const box1 = await banner.boundingBox();
          await page.waitForTimeout(2500);
          const box2 = await banner.boundingBox();
          const state = await page.evaluate(() => { const s = getComputedStyle(document.querySelector('.guide-offer-banner__sheen')); const b = document.querySelector('[data-compact-offer]'); return { animation: s.animationName, minHeight: getComputedStyle(b).minHeight, contain: getComputedStyle(b).contain, shifts: window.__shifts, headings: b.querySelectorAll('h1,h2,h3,h4,h5,h6').length, outline: [...document.querySelectorAll('h2,h3')].some(h => b.contains(h)) }; });
          if (reduced ? state.animation !== 'none' : state.animation === 'none') motion.push(`${url} ${width} reduced=${reduced} animation=${state.animation}`);
          if (state.headings || state.outline) motion.push(url + ' heading inside banner');
          const bannerShift = state.shifts.filter(s => !s.recent && s.nodes.some(n => /guide-offer-banner/.test(n))).reduce((a, s) => a + s.value, 0);
          if (bannerShift > 0 || Math.abs(box1.height - box2.height) > 0.5 || state.minHeight === '0px') shifts.push(`${url} ${width} reduced=${reduced} shift=${bannerShift} h=${box1.height}->${box2.height} min=${state.minHeight}`);
          await context.close();
        }
      } finally { await browser.close(); }
      check('Offer banner: animation runs normally and stops under prefers-reduced-motion; no headings inside', motion.length === 0, motion.join('; ') || '12 browser cases');
      check('Offer banner: reserved space and zero layout shift (CLS) at 1280 and 390px', shifts.length === 0, shifts.join('; ') || '12 browser cases, banner layout-shift 0');
    }

    // 8. Inventory of every [CONFIRM] / [VERIFY] left, by file and page.
    const inventory = [];
    const scan = dir => { for (const f of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = path.join(dir, f.name).replace(/\\/g, '/');
      if (f.isDirectory()) { if (!['node_modules', 'build'].includes(f.name)) scan(rel); continue; }
      if (!/\.(ejs|json|js)$/.test(f.name)) continue;
      fs.readFileSync(path.join(root, rel), 'utf8').split('\n').forEach((line, i) => { for (const m of line.matchAll(/\[(CONFIRM|VERIFY):[^\]]*\]/g)) inventory.push({ file: rel + ':' + (i + 1), item: m[0], pages: Object.keys(html).filter(u => html[u].includes(m[0].slice(0, 40))) }); });
    } };
    ['views', 'config', 'data', 'utils'].forEach(scan);
    for (const m of markers) if (!inventory.some(i => m.excerpt.startsWith(i.item.slice(0, 30)))) inventory.push({ file: '(rendered only)', item: m.excerpt, pages: [m.url] });

    fs.writeFileSync(path.join(root, 'docs/release-final-2026-11/check-results.json'), JSON.stringify({ ran: new Date().toISOString(), results, inventory }, null, 2) + '\n');
    const failed = results.filter(r => !r.pass);
    console.log('\n| Check | Result | Detail |\n|---|---|---|');
    for (const r of results) console.log(`| ${r.name} | ${r.info ? 'INFO' : r.pass ? 'PASS' : 'FAIL'} | ${String(r.detail).replace(/\|/g, '/').slice(0, 400)} |`);
    console.log('\n[CONFIRM]/[VERIFY] items left (' + inventory.length + '):');
    for (const i of inventory) console.log('- ' + i.file + ' — ' + i.item + ' — pages: ' + (i.pages.join(', ') || 'none'));
    console.log('\n' + (failed.length ? `RELEASE BLOCKED: ${failed.length} check(s) failed.` : 'All release checks passed.'));
    process.exitCode = failed.length ? 1 : 0;
  } finally {
    await new Promise(r => server.close(r));
    if (app.locals.stopBackgroundTasks) await app.locals.stopBackgroundTasks();
    await new Promise(r => app.locals.db.close(() => r()));
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
