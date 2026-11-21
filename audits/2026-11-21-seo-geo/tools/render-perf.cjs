'use strict';
// Lab-only rendered mobile check (live). Chromium headless, 390x844, CDP throttling: 4x CPU,
// ~1.6 Mbps down / 750 kbps up / 150 ms RTT. Compares raw HTML with rendered DOM and records
// TTFB, FCP, LCP, CLS, transfer by type and horizontal overflow. Not field (CrUX) data.
const path = require('path'), fs = require('fs');
const { chromium } = require(path.resolve(__dirname, '../../../.qa/node_modules/playwright-core'));
const base = process.argv[2] || 'https://009compliance.com';
const urls = ['/', '/fca-authorisation-motor-dealers', '/ccr009-return-assistance-motor-dealers', '/motor-dealer-compliance', '/services', '/pricing', '/contact', '/about', '/testimonials', '/referral', '/do-motor-dealers-need-fca-authorisation', '/what-is-ccr009', '/fca-compliance-motor-dealers-guide', '/consumer-duty-motor-dealers', '/terms'];
(async () => {
  const b = await chromium.launch({ headless: true });
  const results = [];
  for (const u of urls) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36 009-audit' });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const bytes = {}; let requests = 0; const thirdParty = new Set();
    page.on('response', async r => { requests++; const t = r.request().resourceType(); const len = Number(r.headers()['content-length'] || 0); bytes[t] = (bytes[t] || 0) + len; const h = new URL(r.url()).hostname; if (!h.endsWith('009compliance.com')) thirdParty.add(h); });
    await page.addInitScript(() => { window.__m = { lcp: 0, cls: 0, lcpEl: '' }; new PerformanceObserver(l => { for (const e of l.getEntries()) { window.__m.lcp = e.startTime; window.__m.lcpEl = (e.element?.tagName || '') + '.' + (e.element?.className || '').toString().slice(0, 40); } }).observe({ type: 'largest-contentful-paint', buffered: true }); new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__m.cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); });
    const raw = await (await fetch(base + u)).text();
    const t0 = Date.now();
    await page.goto(base + u, { waitUntil: 'load', timeout: 90000 });
    await page.waitForTimeout(3000);
    const m = await page.evaluate(() => { const nav = performance.getEntriesByType('navigation')[0]; const fcp = performance.getEntriesByName('first-contentful-paint')[0]; const q = s => document.querySelector(s);
      return { ...window.__m, ttfb: nav.responseStart, fcp: fcp?.startTime, domContentLoaded: nav.domContentLoadedEventEnd, title: document.title, h1: q('h1')?.innerText.replace(/\s+/g, ' ').trim(), canonical: q('link[rel=canonical]')?.href, links: document.querySelectorAll('a[href]').length,
        overflow: document.documentElement.scrollWidth > innerWidth, cookieBanner: !!q('[class*=cookie i][role=dialog], #cookie-banner, .cookie-banner, [data-consent]'), fontsLoaded: document.fonts.size,
        tapTargetsSmall: [...document.querySelectorAll('main a, main button')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 24 || r.width < 24); }).length };
    });
    const rawTitle = (raw.match(/<title>([\s\S]*?)<\/title>/) || [])[1]?.trim();
    const rawLinks = (raw.match(/<a\s[^>]*href=/g) || []).length;
    await page.screenshot({ path: path.resolve(__dirname, '../data/screens/mobile' + (u === '/' ? '-home' : u.replace(/\//g, '-')) + '.png') });
    results.push({ url: u, env: base.includes('009compliance.com') ? 'live' : 'local', ...m, rawTitle, titleMatches: rawTitle === m.title.replace(/&amp;/g, '&'), rawLinks, renderedLinks: m.links, requests, kb: Object.fromEntries(Object.entries(bytes).map(([k, v]) => [k, Math.round(v / 1024)])), thirdParty: [...thirdParty], wallMs: Date.now() - t0 });
    await ctx.close();
    console.log(u, 'LCP', Math.round(m.lcp), 'CLS', m.cls.toFixed(3), 'TTFB', Math.round(m.ttfb), 'req', requests);
  }
  fs.writeFileSync(path.resolve(__dirname, '../data/render-perf-' + (base.includes('009compliance.com') ? 'live' : 'local') + '.json'), JSON.stringify({ conditions: '390x844 mobile, 4x CPU, 1.6Mbps/750kbps, 150ms RTT, Chromium headless lab', measuredAt: new Date().toISOString(), results }, null, 1));
  await b.close();
})();
