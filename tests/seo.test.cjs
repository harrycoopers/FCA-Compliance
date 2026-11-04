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
const manifest = require('../config/asset-manifest.json');
let server, base;
const get = (url, options = {}) => fetch(base + url, { redirect: 'manual', ...options });
const post = (url, body, cookie = '') => get(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', cookie }, body: new URLSearchParams(body) });
const cookieFrom = response => response.headers.get('set-cookie')?.split(';')[0] || '';
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
  assert(!sitemap.includes('<lastmod>')); assert(!sitemap.includes('/login'));
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

test('all 18 reviewed guides render matching FAQs, sourced content and qualified animated CTAs', async () => {
  const guides = require('../config/guide-content.json');
  const escape = require('ejs').escapeXML;
  assert.equal(Object.keys(guides).length, 18);
  for (const [url, guide] of Object.entries(guides)) {
    const response = await get(url); assert.equal(response.status, 200, url);
    const html = await response.text();
    const schemas = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
    const faq = schemas.filter(s => s['@type'] === 'FAQPage');
    assert.equal(faq.length, 1, 'one FAQ schema: ' + url);
    assert.deepEqual(faq[0].mainEntity.map(q => [q.name, q.acceptedAnswer.text]), guide.faqs.map(f => [f.question, f.answer]));
    for (const item of guide.faqs) {
      assert(html.includes('<summary>' + escape(item.question) + '</summary>'), url);
      assert(html.includes(escape(item.answer)), url);
    }
    for (const source of guide.sources) assert(html.includes('href="' + source.href + '"'), url);
    assert(html.includes('class="afc-art"'), url);
    assert(html.includes('class="offer-card__orbit"'), url);
    assert(html.includes('£600 minimum service commitment'), url);
    assert(html.includes('FCA application fee payable separately'), url);
    assert(html.includes('href="/contact#book-meeting"'), url);
    assert.equal(html.includes('id="guide-finance-title"'), guide.finance, url);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
    assert.equal(new Set(ids).size, ids.length, 'duplicate IDs: ' + url);
    for (const link of html.matchAll(/href="#([^"]+)"/g)) assert(ids.includes(link[1]), 'missing anchor ' + url + '#' + link[1]);
  }
});

test('guides preserve the offer expiry fallback and distinguish assistance from finance', async () => {
  const campaign = require('../config/campaign');
  const previous = campaign.postCampaign.mode;
  process.env.CAMPAIGN_NOW = '2026-12-26T00:00:01Z';
  campaign.postCampaign.mode = 'unconfirmed';
  try {
    const html = await (await get('/credit-broking-permission-motor-dealers')).text();
    assert(html.includes('Talk through your FCA application'));
    assert(!html.includes('Get started for <span class="gradient-text">£100'));
    assert(html.includes('Separate from FCA authorisation assistance. Required permissions and broker onboarding must be in place.'));
  } finally {
    campaign.postCampaign.mode = previous;
    process.env.CAMPAIGN_NOW = '2026-11-01T12:00:00Z';
  }
});
