'use strict';
/*
 * SEO/GEO audit crawler (read-only). Usage, from the repository root:
 *   node audits/2026-11-21-seo-geo/tools/crawl.cjs live    -> https://009compliance.com
 *   node audits/2026-11-21-seo-geo/tools/crawl.cjs local   -> in-process local build, isolated temp DB
 * Discovers URLs from routes/registries/sitemaps/robots/llms.txt/Search Console exports and a
 * BFS crawl from "/", fetches each with manual redirect handling, parses the raw HTML with a real
 * DOM (Chromium, JavaScript disabled) and writes data/crawl-<env>.json. GET only; never submits forms.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const root = path.resolve(__dirname, '../../..');
const out = path.resolve(__dirname, '../data');
fs.mkdirSync(out, { recursive: true });
const env = process.argv[2] || 'live';
const { chromium } = require(path.join(root, '.qa/node_modules/playwright-core'));
const ORIGIN = 'https://009compliance.com';

async function startLocal() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), '009-audit-'));
  delete process.env.NODE_ENV; delete process.env.BASE_URL; delete process.env.RELEASE_DATE_PREVIEW;
  Object.assign(process.env, { DB_PATH: path.join(temp, 'audit.sqlite'), SESSION_SECRET: 'audit-only-' + 'x'.repeat(40), CANONICAL_BASE_URL: ORIGIN });
  for (const k of Object.keys(process.env)) if (/^(GOOGLE_|SMTP_|BOOKING_|SHEETS_)/.test(k)) delete process.env[k];
  const load = Module._load;
  Module._load = function (id, parent) {
    if (id === 'dotenv') return { config: () => ({}) };
    if (id === './utils/email' && parent.filename.endsWith('server.js')) return { sendEmail: async () => { throw new Error('email disabled'); } };
    return load.apply(this, arguments);
  };
  const app = require(path.join(root, 'server'));
  Module._load = load;
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  return { base: 'http://127.0.0.1:' + server.address().port, stop: async () => { await new Promise(r => server.close(r)); await app.locals.stopBackgroundTasks?.(); await new Promise(r => app.locals.db.close(() => r())); fs.rmSync(temp, { recursive: true, force: true }); } };
}

const norm = u => { try { const x = new URL(u, ORIGIN); return x.pathname + x.search; } catch { return null; } };

async function fetchChain(base, p, max = 6) {
  const chain = []; let url = /^https?:/.test(p) ? p : base + p; let res, ttfb;
  for (let i = 0; i < max; i++) {
    const t0 = Date.now();
    res = await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 (compatible; 009-SEO-Audit/1.0; read-only)', 'accept-encoding': 'gzip, br' } });
    ttfb = Date.now() - t0;
    chain.push({ url, status: res.status, location: res.headers.get('location') });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { url = new URL(res.headers.get('location'), url).href; continue; }
    break;
  }
  const text = await res.text();
  return { chain, status: res.status, finalUrl: url, ttfbMs: ttfb, bytes: Buffer.byteLength(text), headers: Object.fromEntries(['content-type', 'x-robots-tag', 'cache-control', 'set-cookie', 'content-encoding', 'server', 'cf-cache-status', 'strict-transport-security'].map(h => [h, res.headers.get(h)])), text };
}

async function parse(page, html) {
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  return page.evaluate(() => {
    const q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
    const txt = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();
    const region = a => a.closest('header, .site-header, .nav, [role=banner]') ? 'header' : a.closest('footer, [role=contentinfo]') ? 'footer' : a.closest('nav') && !a.closest('main') ? 'nav' : a.closest('.guide-nav, nav[aria-label="Guides"]') ? 'guide-menu' : a.closest('aside') ? 'aside' : a.closest('main') ? 'main' : 'other';
    const main = q('main') || document.body;
    const ld = qa('script[type="application/ld+json"]').map(s => { try { return JSON.parse(s.textContent); } catch (e) { return { parseError: String(e) }; } });
    return {
      title: txt(q('title')), description: q('meta[name="description"]')?.content || null, robots: q('meta[name="robots"]')?.content || null,
      canonical: q('link[rel="canonical"]')?.href || null, ogTitle: q('meta[property="og:title"]')?.content || null, ogImage: q('meta[property="og:image"]')?.content || null,
      lang: document.documentElement.lang, viewport: q('meta[name="viewport"]')?.content || null,
      h1: qa('h1').map(txt), h2: qa('h2').map(txt), h3: qa('h3').map(txt).slice(0, 40),
      breadcrumb: !!q('.guide-breadcrumb, nav[aria-label="Breadcrumb"]'),
      words: txt(main).split(' ').filter(Boolean).length,
      firstPara: txt(qa('main p').find(p => txt(p).length > 60)),
      links: qa('a[href]').map(a => ({ href: a.getAttribute('href'), text: txt(a).slice(0, 120), region: region(a), rel: a.rel || '' })),
      images: qa('img').map(i => ({ src: i.getAttribute('src'), alt: i.getAttribute('alt'), w: i.getAttribute('width'), h: i.getAttribute('height'), loading: i.getAttribute('loading') })),
      scripts: qa('script[src]').map(s => s.getAttribute('src')), styles: qa('link[rel="stylesheet"]').map(s => s.getAttribute('href')),
      ldTypes: ld.flatMap(n => (Array.isArray(n) ? n : [n]).map(x => x['@type'] || (x.parseError ? 'PARSE_ERROR' : '?'))), ld,
      faqVisible: qa('details.ccr009-faq__item').length, forms: qa('form').map(f => f.getAttribute('action'))
    };
  });
}

(async () => {
  let base = ORIGIN, local;
  if (env === 'local') { local = await startLocal(); base = local.base; }
  const pages = require(path.join(root, 'config/seo-pages.json'));
  const guides = require(path.join(root, 'config/guide-content.json'));
  const sources = {};
  const add = (p, src) => { const n = norm(p); if (!n || !n.startsWith('/')) return; (sources[n] ||= new Set()).add(src); };
  // Repository sources (both environments use them as candidates).
  Object.keys(pages).forEach(p => add(p, 'registry:seo-pages'));
  Object.keys(guides).forEach(p => add(p, 'registry:guide-content'));
  const serverSrc = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  for (const m of serverSrc.matchAll(/app\.(?:get|all)\('(\/[^':]*)'/g)) add(m[1], 'route:server.js');
  for (const m of serverSrc.matchAll(/slug: '(\/[^']+)'/g)) add(m[1], 'route:server.js slug');
  for (const m of serverSrc.matchAll(/\['(\/[a-z0-9-]+)'(?:, '(\/[a-z0-9-]+)')*/g)) add(m[1], 'route:server.js list');
  for (const p of ['/login', '/register', '/forgot-password', '/reset-password', '/verify-email-notice', '/logout', '/dashboard', '/reports', '/reports/new', '/terms', '/unsubscribe', '/api/metrics', '/llms.txt', '/robots.txt', '/sitemap.xml', '/36341005a716865fb5c566c8d7418ce1.txt']) add(p, 'utility');
  // Search Console exports.
  for (const f of ['docs/guide-release-review/search-console-Pages.csv']) for (const line of fs.readFileSync(path.join(root, f), 'utf8').split('\n').slice(1)) { const u = line.split(',')[0]; if (u.startsWith('http')) add(u, 'search-console'); }
  // Variants that affect search.
  const variants = ['/do-motor-dealers-need-fca-authorisation/', '/DO-MOTOR-DEALERS-NEED-FCA-AUTHORISATION', '/fca-authorisation-motor-dealers?utm_source=test', '/index.html', '/guides/', '/this-page-does-not-exist', '/fca-authorisation-cost-car-dealers'];
  variants.forEach(v => add(v, 'variant'));
  // Live/served discovery files.
  const sm = await fetchChain(base, '/sitemap.xml');
  const sitemapUrls = [...sm.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  const lastmods = Object.fromEntries([...sm.text.matchAll(/<loc>([^<]+)<\/loc><lastmod>([^<]+)<\/lastmod>/g)].map(m => [norm(m[1]), m[2]]));
  sitemapUrls.forEach(u => add(u, 'sitemap'));
  const robots = await fetchChain(base, '/robots.txt');
  const llms = await fetchChain(base, '/llms.txt');
  for (const m of llms.text.matchAll(/\((https?:[^)]+)\)/g)) add(m[1], 'llms.txt');

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.route('**/*', r => r.abort());
  const results = {};
  const queue = [['/', 0]]; const depth = { '/': 0 };
  const isHtmlCandidate = p => !/\.(txt|xml|png|jpe?g|svg|webp|css|js|woff2?|ico|pdf)$/i.test(p.split('?')[0]) && !p.startsWith('/build/');
  async function visit(p) {
    if (results[p]) return results[p];
    const r = await fetchChain(base, p);
    const rec = { path: p, status: r.status, chain: r.chain.map(c => ({ url: c.url.replace(base, ''), status: c.status, location: c.location })), ttfbMs: r.ttfbMs, bytes: r.bytes, headers: r.headers };
    if (/html/.test(r.headers['content-type'] || '') && r.status === 200) Object.assign(rec, await parse(page, r.text));
    else if (/pdf/.test(r.headers['content-type'] || '')) rec.pdf = true;
    results[p] = rec; return rec;
  }
  // BFS crawl from homepage (ordinary crawlable <a href> links only).
  while (queue.length) {
    const [p, d] = queue.shift();
    const rec = await visit(p);
    add(p, 'crawl');
    for (const l of rec.links || []) {
      if (!l.href || /^(mailto|tel|javascript):/.test(l.href) || l.href.startsWith('#')) continue;
      const abs = new URL(l.href, base + p);
      if (abs.origin !== new URL(base).origin && abs.hostname !== '009compliance.com') continue;
      const n = abs.pathname + abs.search;
      if (!isHtmlCandidate(n)) continue;
      if (depth[n] === undefined) { depth[n] = d + 1; queue.push([n, d + 1]); }
    }
  }
  for (const p of Object.keys(sources)) await visit(p);
  // Hostname/protocol variants (live only).
  const hostVariants = {};
  if (env === 'live') for (const u of ['http://009compliance.com/', 'http://www.009compliance.com/', 'https://www.009compliance.com/', 'https://www.009compliance.com/pricing?ref=abc', 'http://009compliance.com/guides']) {
    try { const r = await fetchChain('', u); hostVariants[u] = r.chain; } catch (e) { hostVariants[u] = String(e); }
  }
  // Inlinks (unique source pages), split by region.
  const inlinks = {};
  // Count only canonical content pages as sources (exclude redirecting, parameter and case/slash variants).
  const canonicalSource = src => results[src]?.status === 200 && !src.includes('?') && /^index/.test(results[src].robots || '') && (!results[src].canonical || new URL(results[src].canonical).pathname === src);
  for (const [src, rec] of Object.entries(results)) if (canonicalSource(src)) for (const l of rec.links || []) {
    if (!l.href || l.href.startsWith('#') || /^(mailto|tel):/.test(l.href)) continue;
    const abs = new URL(l.href, base + src); if (abs.origin !== new URL(base).origin) continue;
    const n = abs.pathname; const t = (inlinks[n] ||= { all: new Set(), contextual: new Set(), chrome: new Set(), anchors: {} });
    if (n === src) continue;
    t.all.add(src); (['main', 'aside'].includes(l.region) ? t.contextual : t.chrome).add(src);
    (t.anchors[l.text] ||= 0); t.anchors[l.text]++;
  }
  for (const rec of Object.values(results)) delete rec.ldRaw;
  const data = { env, base: env === 'live' ? ORIGIN : 'local build (in-process, ' + base + ')', crawledAt: new Date().toISOString(),
    robots: robots.text, robotsStatus: robots.status, llmsStatus: llms.status, llms: llms.text, sitemapStatus: sm.status, sitemapUrls, lastmods,
    sources: Object.fromEntries(Object.entries(sources).map(([k, v]) => [k, [...v]])), depth, hostVariants,
    inlinks: Object.fromEntries(Object.entries(inlinks).map(([k, v]) => [k, { all: v.all.size, contextual: v.contextual.size, chrome: v.chrome.size, contextualFrom: [...v.contextual], anchors: v.anchors }])),
    pages: results };
  fs.writeFileSync(path.join(out, `crawl-${env}.json`), JSON.stringify(data, null, 1));
  console.log(env, 'urls', Object.keys(results).length, 'crawl-reachable', Object.keys(depth).length, 'sitemap', sitemapUrls.length);
  await browser.close(); if (local) await local.stop();
})().catch(e => { console.error(e); process.exitCode = 1; });
