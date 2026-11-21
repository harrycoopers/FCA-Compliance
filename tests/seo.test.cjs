'use strict';
// Real Express, EJS, SQLite and bcrypt; isolated DB, no .env or external delivery.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), '009-seo-test-'));
process.env.DB_PATH = path.join(temp, 'test.sqlite');
process.env.SESSION_SECRET = 'isolated-seo-regression-test-only';
process.env.TRUST_PROXY = 'loopback'; // This test explicitly simulates the known local reverse proxy.
process.env.CANONICAL_BASE_URL = 'https://009compliance.com';
process.env.CAMPAIGN_NOW = '2026-11-01T12:00:00Z';
process.env.RELEASE_DATE_PREVIEW = '2026-12-01'; // config/release.js keeps its placeholder until deploy day
for (const key of Object.keys(process.env)) if (/^(GOOGLE_|SMTP_|BOOKING_)/.test(key)) delete process.env[key];
const delivered = [];
const load = Module._load;
Module._load = function(id, parent) {
  if (id === 'dotenv') return { config: () => ({}) };
  if (id === './utils/email' && parent.filename.endsWith('server.js')) return { sendEmail: async message => delivered.push(message) };
  return load.apply(this, arguments);
};
const app = require('../server');
Module._load = load;
const pages = require('../config/seo-pages.json');
const { guideText } = require('../utils/guide-editorial');
const manifest = require('../config/asset-manifest.json');
let server, base;
const schemasFrom = html => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => JSON.parse(match[1]));
const get = (url, options = {}) => fetch(base + url, { redirect: 'manual', ...options });
const post = (url, body, cookie = '') => get(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', cookie }, body: new URLSearchParams(body) });
const cookieFrom = response => response.headers.get('set-cookie')?.split(';')[0] || '';

test('analytics stays disabled with no consent interface or tracking hooks', async () => {
  for (const route of ['/', '/pricing', '/what-is-ccr009', '/contact', '/login']) {
    const html = await (await get(route)).text();
    assert(!/<script[^>]+src="https:\/\/(?:www\.)?(?:googletagmanager|google-analytics)\.com/.test(html), route);
    assert.equal((html.match(/analytics-disabled\.[a-f0-9]+\.js/g) || []).length, 1);
    assert(!/data-analytics-(?:choice|preferences|panel|enabled)|data-guide-event=|data-guide-placement=/.test(html));
  }
});

test('Pricing paragraph and FAQ/schema prices follow confirmed campaign states', async () => {
  const campaign = require('../config/campaign'), mode = campaign.postCampaign.mode, now = process.env.CAMPAIGN_NOW;
  try {
    for (const scenario of [
      {now:'2026-11-12T12:00:00Z', mode:'continue', show:true},
      {now:'2026-12-26T00:00:01Z', mode:'continue', show:true},
      {now:'2026-12-26T00:00:01Z', mode:'unconfirmed', show:false},
      {now:'2026-12-26T00:00:01Z', mode:'custom', show:false}
    ]) {
      campaign.postCampaign.mode = scenario.mode; process.env.CAMPAIGN_NOW = scenario.now;
      const html = await (await get('/pricing')).text();
      assert.equal(html.includes('Following FCA authorisation, the existing £100 monthly subscription continues'), scenario.show);
      assert.equal(/£\s*\d/.test(html), scenario.show, scenario.mode + ' no price leakage in HTML/schema');
      assert(!JSON.stringify(schemasFrom(html).find(node => node['@type'] === 'FAQPage')).includes('£1,000'));
      assert(html.includes('The FCA application fee, which is paid separately.'));
      assert(html.includes('Current pricing confirmed before you start.'));
      assert(html.includes('href="#book-meeting"'));
    }
  } finally { campaign.postCampaign.mode = mode; process.env.CAMPAIGN_NOW = now; }
});
before(async () => { server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); base = 'http://127.0.0.1:' + server.address().port; });
after(async () => { await new Promise(r => server.close(r)); await app.locals.stopBackgroundTasks(); await new Promise((resolve,reject)=>app.locals.db.close(e=>e?reject(e):resolve())); fs.rmSync(temp,{recursive:true,force:true}); });

test('all public pages have unique metadata, canonical URLs, valid schema, content and working assets', async () => {
  const titles = new Set(), descriptions = new Set(), checkedAssets = new Set();
  for (const [url, page] of Object.entries(pages)) {
    const response = await get(url); assert.equal(response.status, 200, url);
    assert.match(response.headers.get('set-cookie') || '', /HttpOnly/, 'CSRF session is protected: ' + url);
    assert.equal(response.headers.get('x-robots-tag'), null, url);
    const html = await response.text();
    const title = html.match(/<title>(.*?)<\/title>/s)[1];
    const description = html.match(/<meta name="description" content="([^"]*)"/)[1];
    assert(!titles.has(title), 'duplicate title: ' + url); titles.add(title);
    assert(!descriptions.has(description), 'duplicate description: ' + url); descriptions.add(description);
    assert(html.includes('href="https://009compliance.com' + url + '"'), url);
    assert.equal((html.match(/rel="canonical"/g) || []).length, 1, url);
    assert.equal((html.match(/<h1\b/g) || []).length, 1, url);
    assert(!html.includes('cdn.tailwindcss.com'), url);
    assert(!html.includes('Monthly Submission Complete') && !/\{\{[^}]+\}\}/.test(html), url);
    assert(!html.includes('<meta name="robots" content="noindex'), url);
    for (const schema of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) JSON.parse(schema[1]);
    for (const match of html.matchAll(/(?:href|src)="(\/(?:build|fonts|images)\/[^"?]+)[^"]*"/g)) {
      if (checkedAssets.has(match[1])) continue;
      const asset = await get(match[1]); assert.equal(asset.status, 200, match[1]); await asset.arrayBuffer(); checkedAssets.add(match[1]);
      if (match[1].startsWith('/build/')) assert.match(asset.headers.get('cache-control'), /max-age=31536000, immutable/);
    }
  }
});
test('FCA title, qualified price description and campaign expiry', async () => {
  let html = await (await get('/fca-authorisation-motor-dealers')).text();
  assert(html.includes('<title>FCA Authorisation for Motor Dealers | Get Started for £100</title>'));
  assert(html.includes('<meta name="description" content="Get help with your motor dealership’s FCA authorisation application. Start for £100, then £100/month. Six-month minimum. FCA application fee paid separately.">'));
  process.env.CAMPAIGN_NOW = '2026-12-26T00:00:01Z';
  html = await (await get('/fca-authorisation-motor-dealers')).text();
  assert(!html.includes('Christmas offer ends in'));
  assert(html.includes('<title>FCA Authorisation for Motor Dealers | Get Started for £100</title>'));
  process.env.CAMPAIGN_NOW = '2026-11-01T12:00:00Z';
});
test('one-hop production redirects retain tracking and referral parameters; preview stays local', async () => {
  const query = '?utm_source=google&gclid=AbC%2B123&referrals=3';
  for (const url of Object.keys(pages)) {
    const variant = url === '/' ? '/' : url.toUpperCase() + '/';
    const response = await get(variant + query, { headers: { 'x-forwarded-host': 'www.009compliance.com', 'x-forwarded-proto': 'http' } });
    assert.equal(response.status, 301, url);
    assert.equal(response.headers.get('location'), 'https://009compliance.com' + url + query);
  }
  const nativeHost = await new Promise((resolve, reject) => require('node:http').get(base + '/' + query, { headers: { Host: 'www.009compliance.com', 'X-Forwarded-Proto': 'http' } }, response => { response.resume(); resolve(response); }).on('error', reject));
  assert.equal(nativeHost.statusCode, 301);
  assert.equal(nativeHost.headers.location, 'https://009compliance.com/' + query);
  const correct = await get('/fca-authorisation-motor-dealers' + query, { headers: { 'x-forwarded-host': '009compliance.com', 'x-forwarded-proto': 'https' } });
  assert.equal(correct.status, 200);
  const local = await get('/ABOUT/' + query); assert.equal(local.headers.get('location'), '/about' + query);
  const head = await get('/ABOUT/', { method: 'HEAD' }); assert.equal(head.status, 301);
  const token = await get('/reset-password/AbC123?token=AbC123'); assert.equal(token.status, 302); assert.equal(token.headers.get('location'), '/forgot-password');
  const callback = await get('/api/bookings/google/callback?state=AbC123', { headers: { 'x-forwarded-host': 'www.009compliance.com', 'x-forwarded-proto': 'http' } }); assert.equal(callback.status, 410); assert.equal(callback.headers.get('location'), null);
  const submission = await get('/CONTACT', { method: 'POST', headers: { 'x-forwarded-host': 'www.009compliance.com', 'x-forwarded-proto': 'http', accept: 'application/json', 'content-type': 'application/json' }, body: '{}' }); assert.equal(submission.status, 403);
});
test('robots, sitemap, private pages, 404 and removed diagnostics', async () => {
  const robots = await (await get('/robots.txt')).text(); assert(robots.includes('\nSitemap:')); assert(!robots.includes('\\r\\n'));
  const sitemap = await (await get('/sitemap.xml')).text();
  assert.equal((sitemap.match(/<loc>/g) || []).length, Object.keys(pages).length);
  assert.equal((sitemap.match(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g) || []).length, Object.keys(pages).length); assert(!sitemap.includes('/login'));
  for (const url of Object.keys(pages)) assert(sitemap.includes('<loc>https://009compliance.com' + url + '</loc>'));
  for (const url of ['/login', '/register', '/forgot-password']) {
    const r = await get(url), html = await r.text(); assert.equal(r.status, 200); assert.match(r.headers.get('x-robots-tag'), /noindex/); assert(html.includes('content="noindex,follow"')); assert(!html.includes('rel="canonical"'));
  }
  const retiredVerification = await get('/verify-email-notice'); assert.equal(retiredVerification.status, 302); assert.equal(retiredVerification.headers.get('location'), '/login');
  for (const url of ['/test-email', '/test-sheets', '/debug-env', '/nonexistent-seo-test']) {
    const r = await get(url); assert.equal(r.status, 404); assert.match(r.headers.get('x-robots-tag'), /noindex/);
  }
  for (const url of ['/dashboard', '/reports', '/reports/new']) { const r = await get(url); assert.equal(r.status, 302); assert.equal(r.headers.get('location'), '/login'); }
  const internal = await get('/internal/bookings'); assert.equal(internal.status, 401);
  const booking = await get('/api/bookings/availability?date=2026-11-03'); assert.equal(booking.status, 503); assert.match(booking.headers.get('x-robots-tag'), /noindex/);
});
test('no shadowed GET routes and repaired payments anchor', async () => {
  const seen = new Set();
  for (const layer of app._router.stack) if (layer.route?.methods.get) { assert(!seen.has(layer.route.path), layer.route.path); seen.add(layer.route.path); }
  assert((await (await get('/pricing')).text()).includes('id="payments"'));
  assert(Object.keys(manifest).length > 50);
  const guide = await (await get('/what-is-ccr009')).text();
  assert(!guide.includes(manifest['/js/christmas-arrival.js']));
  assert(!guide.includes(manifest['/js/campaign.js']));
  const fca = await (await get('/fca-authorisation-motor-dealers')).text();
  assert(fca.includes(manifest['/js/christmas-arrival.js']));
  assert(fca.includes(manifest['/js/campaign.js']));
});
test('text responses support gzip without publicly caching personalised HTML', async () => {
  const response = await new Promise((resolve, reject) => require('node:http').get(base + '/fca-authorisation-motor-dealers', { headers: { 'Accept-Encoding': 'gzip' } }, result => { result.resume(); resolve(result); }).on('error', reject));
  assert.equal(response.headers['content-encoding'], 'gzip');
  assert.match(response.headers['cache-control'], /private/);
});
test('contact and account POST routes require CSRF even through SEO middleware', async () => {
  for(const url of ['/contact','register/precheck','/login'].map(x=>x.startsWith('/')?x:'/'+x)) {
    const r=await post(url,{}); assert.equal(r.status,403,url);
  }
  assert.equal(delivered.length,0);
});

test('all 24 guides preserve visible FAQs and render appropriate schema and relevant animated CTAs', async () => {
  const guides = require('../config/guide-content.json');
  const escape = require('ejs').escapeXML;
  const release = require('../config/release');
  assert.equal(Object.keys(guides).length, 24);
  for (const [url, guide] of Object.entries(guides)) {
    const response = await get(url); assert.equal(response.status, 200, url);
    const html = await response.text();
    const schemas = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
    const faq = schemas.filter(s => s['@type'] === 'FAQPage');
    assert.equal(faq.length, 1, url);
    assert.deepEqual(faq[0].mainEntity.map(q => [q.name, q.acceptedAnswer.text]), guide.faqs.map(q => [guideText(q.question), guideText(q.answer)]));
    const article = schemas.find(s => s['@type'] === 'Article');
    assert.equal(article.headline, guide.title);
    assert.equal(article.dateModified, release.resolve(guide.modified), 'only actual guide revisions have modification dates');
    assert.equal(article.datePublished, release.resolve(guide.published) || undefined);
    assert(article.author && article.image && html.includes('Guide updated <time datetime="' + release.resolve(guide.modified) + '">'));
    const breadcrumb = schemas.find(s => s['@type'] === 'BreadcrumbList');
    assert.equal(breadcrumb.itemListElement.length, 3);
    assert.equal(breadcrumb.itemListElement.at(-1).name, guide.title);
    assert(html.includes('aria-current="page"'));
    assert(html.includes('property="og:type" content="article"'));
    for (const item of guide.faqs) {
      assert(html.includes('<summary>' + escape(guideText(item.question)) + '</summary>'), url);
      assert(html.includes(escape(guideText(item.answer))), url);
    }
    for (const source of guide.sources) assert(html.includes('href="' + source.href + '"'), url);
    assert(html.includes('class="afc-art"'), url);
    const offerBlock = html.match(/<section class="guide-(?:offer|original-offer)[\s\S]*?<\/section>/)?.[0] || '';
    if (guide.group === 'fca') {
      assert(offerBlock.includes('class="offer-card__orbit"'), url);
      assert(offerBlock.includes('£600 minimum service commitment'), url);
      assert(offerBlock.includes('FCA application fee payable separately'), url);
      assert(offerBlock.includes('Your first payment counts as month one.'), url);
      assert(offerBlock.includes('Direct Debit'), url);
    } else if (guide.group === 'ccr') {
      assert(offerBlock.includes('Priced to scope'), url);
      assert(offerBlock.includes('/ccr009-return-assistance-motor-dealers'), url);
      assert(!offerBlock.includes('£100'), url);
    } else {
      assert(offerBlock.includes('Ongoing compliance support'), url);
      assert(!offerBlock.includes('£100'), url);
    }
    const topic = guide.group === 'fca' ? 'authorisation' : guide.group === 'ccr' ? 'ccr009' : 'ongoing';
    assert(html.includes('href="/contact?topic=' + topic + '#book-meeting"'), url);
    assert(html.includes('id="guide-navigation"'), url);
    assert(!html.includes('id="guide-finance-title"'), 'no competing motor-finance promotion in guides: ' + url);
    assert.equal((html.match(/data-guide-offer\b/g) || []).length, 1, url);
    assert(html.includes('class="afc-button"'), url);
    assert(!html.includes('data-guide-event=') && !html.includes('data-guide-placement='), url);
    // Inert template content has its own document fragment, not live-page IDs.
    const liveHtml=html.replace(/<template\b[^>]*>[\s\S]*?<\/template>/g,'');
    const ids = [...liveHtml.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
    assert.equal(new Set(ids).size, ids.length, 'duplicate IDs: ' + url);
    for (const link of html.matchAll(/href="#([^"]+)"/g)) assert(ids.includes(link[1]), 'missing anchor ' + url + '#' + link[1]);
  }
});

// Two evidence stages: the 12 November 2026 revision (docs/guide-improvements-2026-11), then this
// release (docs/release-final-2026-11). Every changed field needs an exact before/after record.
function compareStage(before, after, changes, opts) {
  for (const url of Object.keys(before)) {
    const records = changes.filter(c => c.guide === url);
    function compare(oldValue, current, path = '') {
      if (path === 'description' && opts.skipDescription) return;
      const change = records.find(c => c.section === path);
      if (change) {
        assert.deepEqual(oldValue ?? null, change.before, url + ' evidence before ' + path);
        assert.deepEqual(current, change.after, url + ' evidence after ' + path);
        assert.equal(change.checked, opts.checked);
        for (const source of change.sources) assert(opts.hosts.some(h => new URL(source.url).hostname.endsWith(h)), 'primary source only: ' + source.url);
        return;
      }
      if (path === 'sources' || path.endsWith('.sources')) {
        for (const source of oldValue) assert(current.some(s => JSON.stringify(s) === JSON.stringify(source)), 'original source removed');
        for (const source of current) assert(oldValue.some(s => s.href === source.href) || records.some(c => c.sources.some(s => s.url === source.href)), 'new source absent from evidence');
        return;
      }
      if (oldValue && typeof oldValue === 'object') {
        assert.equal(Array.isArray(oldValue), Array.isArray(current));
        if (Array.isArray(oldValue)) assert.equal(current.length, oldValue.length, url + path);
        else {
          const extra = Object.keys(current).filter(k => !(k in oldValue) && !(path === '' && opts.ignoredTop.includes(k)));
          for (const key of extra) assert(records.some(c => c.section === (path ? path + '.' + key : key)), url + ' unrecorded new field ' + key);
          for (const key of extra) compare(undefined, current[key], path ? path + '.' + key : key);
          assert.deepEqual(Object.keys(oldValue).filter(k => k in current), Object.keys(oldValue), url + path);
        }
        for (const key of Object.keys(oldValue)) if (!(path === '' && opts.ignoredTop.includes(key))) compare(oldValue[key], current[key], path ? path + '.' + key : key);
      } else assert.deepEqual(current, oldValue, url + ' unlisted change ' + path);
    }
    compare(before[url], after[url]);
    assert.equal(after[url].reviewed, before[url].reviewed, 'original source-check date retained');
    opts.modified(url, records, after[url]);
  }
}

test('guide revisions match the source evidence and preserve all unlisted educational fields', () => {
  const original = require('../docs/guide-improvements-2026-11/content-before.json');
  const baseline = require('../docs/release-final-2026-11/content-before.json');
  const current = require('../config/guide-content.json');
  const first = require('../docs/guide-improvements-2026-11/content-evidence.json').changes;
  const second = require('../docs/release-final-2026-11/content-evidence.json').changes;
  assert.deepEqual(Object.keys(baseline), Object.keys(original), 'established guide routes preserved');
  compareStage(original, baseline, first, { checked: '2026-11-12', hosts: ['fca.org.uk'], skipDescription: true, ignoredTop: ['modified', 'updateSummary', 'published'],
    modified: (url, records, guide) => assert.equal(guide.modified, records.some(c => !['seoTitle', 'description'].includes(c.section)) ? '2026-11-12' : '2026-11-02') });
  compareStage(baseline, current, second, { checked: '2026-11-21', hosts: ['fca.org.uk', 'legislation.gov.uk', 'gov.uk'], skipDescription: false, ignoredTop: ['modified'],
    modified: (url, records, guide) => assert.equal(guide.modified, records.some(c => !['seoTitle', 'description'].includes(c.section)) ? 'RELEASE_DATE' : baseline[url].modified, 'modified only for revised guides: ' + url) });
  for (const url of Object.keys(current).filter(url => !(url in baseline))) {
    const record = second.find(c => c.guide === url && c.section === 'new-guide');
    assert(record, 'new guide has evidence: ' + url);
    assert.deepEqual(record.after, current[url], 'new guide matches evidence: ' + url);
    assert.equal(current[url].published, 'RELEASE_DATE'); assert.equal(current[url].modified, 'RELEASE_DATE');
    for (const source of current[url].sources) assert(['fca.org.uk', 'legislation.gov.uk', 'gov.uk'].some(h => new URL(source.href).hostname.endsWith(h)), url + ' primary source: ' + source.href);
    assert(current[url].sections.length >= 4 && current[url].sections.length <= 6, url + ' 4–6 sections');
    assert(current[url].faqs.length >= 3 && current[url].faqs.length <= 5, url + ' 3–5 FAQs');
    assert(current[url].sections.some(s => /^Fictional example/.test(s.title)), url + ' labelled fictional example');
  }
  for (const url of Object.keys(current)) {
    assert.equal(pages[url].title, current[url].seoTitle, 'registry title drift: ' + url);
    assert.equal(pages[url].description, current[url].description, 'registry description drift: ' + url);
  }
});

test('contextual links preserve every paragraph and render escaped, crawlable anchors', async () => {
  const guides = require('../config/guide-content.json');
  const links = require('../config/guide-links.json');
  const {paragraphParts} = require('../utils/guide-links');
  const escape = require('ejs').escapeXML;
  assert.deepEqual(Object.keys(links), Object.keys(guides));
  for (const [route,guide] of Object.entries(guides)) {
    const html = await (await get(route)).text();
    for (const link of links[route]) {
      const section=guide.sections.find(s=>s.id===link.sectionId);
      const text=section?.paragraphs[link.paragraph];
      assert(text && text.split(link.text).length === 2, 'anchor occurs exactly once: '+route+' '+link.text);
      assert(pages[link.href] && link.href !== route, 'known internal target: '+route);
      assert(html.includes('<a class="guide-context-link" href="'+escape(link.href)+'">'+escape(guideText(link.text))+'</a>'), route);
    }
    for (const section of guide.sections) section.paragraphs.forEach((text,index)=>{
      const parts=paragraphParts(route,section.id,index,text);
      assert.equal(parts.map(p=>p.text).join(''),text,'paragraph unchanged: '+route);
      assert.equal(parts.filter(p=>p.href).length,links[route].filter(l=>l.sectionId===section.id && l.paragraph===index).length,'no overlapping links');
    });
  }
  assert.deepEqual(paragraphParts('/unknown','none',0,'<script> & "text"'),[{text:'<script> & "text"'}]);
});

test('guides preserve the offer expiry fallback and omit competing finance promotions', async () => {
  const campaign = require('../config/campaign');
  const previous = campaign.postCampaign.mode;
  process.env.CAMPAIGN_NOW = '2026-12-26T00:00:01Z';
  campaign.postCampaign.mode = 'unconfirmed';
  try {
    const html = await (await get('/credit-broking-permission-motor-dealers')).text();
    assert(html.includes('Talk through your FCA application'));
    assert(!html.includes('Get started for <span class="gradient-text">£100'));
    assert(!html.includes('id="guide-finance-title"'));
    assert(html.includes('Administrative assistance; FCA approval and timing are not guaranteed.'));
  } finally {
    campaign.postCampaign.mode = previous;
    process.env.CAMPAIGN_NOW = '2026-11-01T12:00:00Z';
  }
});

test('desktop and mobile Guides navigation contain every existing route exactly once',async()=>{
  const guides=require('../config/guide-content.json'),navigation=require('../utils/guide-navigation');
  assert.equal(navigation.groups.length,4);
  assert.deepEqual([navigation.overview,...navigation.groups.flatMap(group=>group.links.map(link=>link.href))].sort(),Object.keys(guides).sort());
  for(const route of Object.keys(pages)){
    const html=await(await get(route)).text();
    for(const mode of ['desktop','mobile']){
      const menu=html.match(new RegExp('<details class="guide-nav guide-nav--'+mode+'"[\\s\\S]*?</details>'))?.[0];
      assert(menu,route+' '+mode);
      assert(menu.includes('aria-controls="'+mode+'-guides-panel">'));
      const urls=[...menu.matchAll(/href="([^"]+)"/g)].map(m=>m[1]);
      assert.deepEqual(urls.sort(),Object.keys(guides).sort(),route+' '+mode);
    }
  }
});

test('FCA guides reuse original artwork with a same-page offer target and no obsolete timing claim',async()=>{
  for(const [route,guide]of Object.entries(require('../config/guide-content.json'))){
    const html=await(await get(route)).text();
    assert(!html.includes('guide-offer-cue'),route);
    if(guide.group==='fca'){
      assert(!html.includes('data-guide-gift') && !html.includes('data-guide-full-post'),route);
      assert(html.indexOf('id="guide-application-offer"') > html.indexOf('id="related-guides"'),route);
      assert(html.includes('data-guide-arrival')&&html.includes('data-offer-countdown')&&html.includes('data-referral-base="100"'),route);
      const block=html.match(/<section class="guide-original-offer[\s\S]*?<\/section>/)[0];
      assert(!block.includes('FCA applications can take 6–12 months.'),route);
    }else assert(!html.includes('data-guide-gift')&&!html.includes('data-guide-arrival'),route);
  }
});

test('every FCA guide gates the complete offer on confirmed pricing in every campaign state', async () => {
  const campaign = require('../config/campaign');
  const previousMode = campaign.postCampaign.mode, previousNow = process.env.CAMPAIGN_NOW;
  const routes = Object.entries(require('../config/guide-content.json')).filter(([,g]) => g.group === 'fca').map(([url]) => url);
  try {
    for (const scenario of [
      { now: '2026-11-12T12:00:00Z', mode: 'continue', show: true },
      { now: '2026-12-26T00:00:01Z', mode: 'continue', show: true },
      { now: '2026-12-26T00:00:01Z', mode: 'unconfirmed', show: false },
      { now: '2026-12-26T00:00:01Z', mode: 'custom', show: false }
    ]) {
      process.env.CAMPAIGN_NOW = scenario.now; campaign.postCampaign.mode = scenario.mode;
      for (const url of routes) {
        const html = await (await get(url)).text();
        const block = html.match(/<section class="guide-original-offer[\s\S]*?<\/section>/)[0];
        assert.equal((block.match(/data-offer-countdown\b/g) || []).length, scenario.now < campaign.DEADLINE_ISO ? 1 : 0);
        const faqBlock = html.match(/<section class="ccr009-section ccr009-faq[\s\S]*?<\/section>/)[0];
        // No 009 Compliance price in any FCA guide FAQ or FAQPage schema, in any campaign state.
        // The cost guide may state the FCA's own fees (approved), never 009 Compliance's.
        const faq = schemasFrom(html).find(s => s['@type'] === 'FAQPage');
        for (const text of [faqBlock, JSON.stringify(faq)]) assert(!/£\s?(?:100|600|1,000)\b(?!,)|starting payment/.test(text), url + ': no 009 price in FAQs');
        if (url === '/fca-application-documents-motor-dealers') {
          assert(faqBlock.includes('Is the FCA application fee included in 009 Compliance’s fees?'));
          assert(faqBlock.includes('Does every motor dealer need the same documents?'), 'non-price educational FAQ remains');
        }
        if (scenario.show) {
          for (const text of ['£100', '£600', 'month one', 'Direct Debit', 'six monthly payments', 'FCA application fee payable separately']) assert(block.includes(text), url + ': ' + text);
        } else {
          assert(!/£|&#(?:163|xA3);|six monthly payments|Payments are by/i.test(block), url + ': all price-bearing copy hidden');
          assert(block.includes('Talk through your FCA application'));
          assert(block.includes('/contact?topic=authorisation#book-meeting'));
          assert(block.includes('Administrative assistance; FCA approval and timing are not guaranteed.'));
        }
      }
      const service = await (await get('/fca-authorisation-motor-dealers')).text();
      if (scenario.show) {
        assert(service.includes('£100') && service.includes('£600'));
        assert(service.includes('data-calc-monthly'));
      } else {
        assert(!/£|&#(?:163|xA3);|data-monthly=|data-calc-monthly/i.test(service), 'service page must not leak hidden prices, including referral and continuing subscription copy');
        assert(service.includes('We’ll confirm current pricing and the payment schedule with you before you start.'));
        assert(service.includes('href="#book-meeting"'));
      }
    }
  } finally {
    campaign.postCampaign.mode = previousMode;
    if (previousNow === undefined) delete process.env.CAMPAIGN_NOW; else process.env.CAMPAIGN_NOW = previousNow;
  }
});

test('unfilled identity fields stay private and assigned authors resolve to their About profile', async () => {
  const config = require('../config/site-identity.json');
  const saved = structuredClone(config);
  const guide = '/what-is-ccr009';
  try {
    config.team = { 'profile-test': { name: '{{AUTHOR_NAME}}', jobTitle: '{{AUTHOR_ROLE}}', linkedIn: '{{LINKEDIN}}' } };
    config.guideAuthors = { [guide]: 'profile-test' };
    config.companyLinkedIn = '{{COMPANY_LINKEDIN}}';
    config.googleBusinessProfile = null;
    const about = await (await get('/about')).text();
    const article = await (await get(guide)).text();
    for (const html of [about, article]) {
      assert(!html.includes('{{') && !html.includes('class="guide-byline"') && !html.includes('id="team-title"'));
      assert(!schemasFrom(html).some(node => node['@type'] === 'Person'));
      assert.deepEqual(schemasFrom(html).find(node => node['@type'] === 'Organization').sameAs,
        ['https://find-and-update.company-information.service.gov.uk/company/16910484']);
    }
    assert.equal(schemasFrom(article).find(node => node['@type'] === 'Article').author['@type'], 'Organization');
    config.team['profile-test'].name = 'Test fixture';
    const assigned = await (await get(guide)).text();
    const profile = await (await get('/about')).text();
    assert(assigned.includes('class="guide-byline"') && profile.includes('id="profile-test"'));
    const person = schemasFrom(profile).find(node => node['@type'] === 'Person');
    const author = schemasFrom(assigned).find(node => node['@type'] === 'Article').author;
    assert.equal(author['@id'], person['@id']);
    assert.equal(author.jobTitle, undefined);
    assert.equal(author.sameAs, undefined);
    assert(!assigned.includes('{{') && !profile.includes('{{'));
  } finally {
    Object.assign(config, saved);
  }
});

test('guide directory, llms listings and private file boundaries', async () => {
  const navigation = require('../utils/guide-navigation');
  const response = await get('/guides');
  assert.equal(response.status, 200);
  const html = await response.text();
  const listing = schemasFrom(html).find(node => node['@type'] === 'ItemList');
  const links = navigation.groups.flatMap(group => group.links);
  assert.equal(links.length, 23);
  assert.deepEqual(listing.itemListElement.map(item => new URL(item.url).pathname), links.map(link => link.href));
  const content = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)[1];
  const llms = await (await get('/llms.txt')).text();
  for (const route of [...links.map(link => link.href), navigation.overview]) {
    assert(content.includes('href="' + route + '"') && llms.includes('https://009compliance.com' + route + ')'));
  }
  for (const url of ['/docs/previous-iterations/V8-VERIFICATION.md','/.qa/release-files.txt','/config/site-identity.json','/views/layout.ejs','/server.js','/dashboard/runtime/server.ts']) {
    assert.equal((await get(url)).status, 404, url);
  }
});

test('an open guide hides the expired campaign and requests the server-rendered fallback', () => {
  const vm = require('node:vm');
  const deadline = Date.parse('2026-12-26T00:00:00Z');
  let now = deadline - 1000, callback, reloads = 0;
  const panel = { dataset: { guideActiveMs: '1000' } };
  const root = { dataset: {}, querySelector: () => panel };
  const code = fs.readFileSync(path.join(__dirname, '../public/js/guide-enhancements.js'), 'utf8');
  const events = {};
  vm.runInNewContext(code, {
    document: { querySelector: () => root },
    Date: { parse: Date.parse, now: () => now },
    window: { location: { reload() { reloads++; } }, addEventListener(name, listener) { events[name] = listener; } },
    setTimeout(fn, delay) { assert.equal(delay, 1000); callback = fn; return 1; }, clearTimeout() {}
  });
  assert.equal(reloads, 0);
  now = deadline;
  callback();
  events.pageshow();
  assert.equal(panel.hidden, true);
  assert.equal(reloads, 1);
});

test('audit fixes: metrics endpoint removed; FCA-fee and homepage cost copy follow config and campaign state', async () => {
  assert.equal((await get('/api/metrics')).status, 404);
  const campaign = require('../config/campaign'), offer = require('../config/offer');
  const previousMode = campaign.postCampaign.mode, previousNow = process.env.CAMPAIGN_NOW;
  try {
    for (const scenario of [
      { now: '2026-11-21T12:00:00Z', mode: 'continue', show: true },
      { now: '2026-12-26T00:00:01Z', mode: 'continue', show: true },
      { now: '2026-12-26T00:00:01Z', mode: 'unconfirmed', show: false },
      { now: '2026-12-26T00:00:01Z', mode: 'custom', show: false }
    ]) {
      process.env.CAMPAIGN_NOW = scenario.now; campaign.postCampaign.mode = scenario.mode;
      const home = await (await get('/')).text();
      const faq = schemasFrom(home).find(s => s['@type'] === 'FAQPage');
      const cost = faq.mainEntity.find(q => q.name === 'How much will the support cost?');
      assert(home.includes('<summary>How much will the support cost?</summary>'));
      assert(home.includes(require('ejs').escapeXML(cost.acceptedAnswer.text)), 'visible answer equals schema answer');
      assert(home.includes('href="/fca-authorisation-cost-car-dealers"'));
      assert.equal(cost.acceptedAnswer.text.includes(`£${offer.startPayment} to get started, then £${offer.monthlyPayment} a month by Direct Debit, with a six-month minimum (£${offer.minimumTotal.amount})`), scenario.show);
      if (!scenario.show) assert(!/£/.test(cost.acceptedAnswer.text));
      const service = await (await get('/fca-authorisation-motor-dealers')).text();
      const fees = service.match(/<div class="fee-split"[\s\S]*?<\/div>\s*<\/div>\s*<\/section>/)?.[0] || service.match(/<div class="fee-split"[\s\S]*?Our fees and the FCA[\s\S]*?<\/p>/)[0];
      assert(fees.includes('Our fees and the FCA’s fees') && fees.includes('href="/fca-authorisation-cost-car-dealers"'));
      assert.equal(/£560/.test(fees) && /£1,100/.test(fees) && /FCA fees checked/.test(fees), scenario.show);
      if (!scenario.show) assert(!/£/.test(fees));
      const pricing = await (await get('/pricing')).text();
      assert(pricing.includes('href="/fca-authorisation-cost-car-dealers">FCA application and annual fees</a>'));
      assert.equal(pricing.includes('FCA fees checked'), scenario.show);
    }
  } finally {
    campaign.postCampaign.mode = previousMode;
    if (previousNow === undefined) delete process.env.CAMPAIGN_NOW; else process.env.CAMPAIGN_NOW = previousNow;
  }
});
