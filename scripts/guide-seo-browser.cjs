'use strict';
// Local QA only. Install playwright-core in ignored .qa/ (see verification report).
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '../.qa/node_modules/playwright-core');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const guides = require('../config/guide-content.json');
const dir = 'docs/guide-seo-2026-11';
const base = 'http://127.0.0.1:3099';
const baselineMode = process.argv.includes('--baseline');
const saved = baselineMode ? JSON.parse(require('node:zlib').gunzipSync(fs.readFileSync(dir + '/rendered-before.json.gz'))) : null;
const education = page => page.evaluate(() => {
  const selectors = ['#guide-title', '.guide-answer', '.guide-reviewed', ...Array.from(document.querySelectorAll('.ccr009-section[id^="guide-section-"]'), el => '#' + el.id), '#guide-faq', '#guide-sources', '#related-guides'];
  return Object.fromEntries(selectors.map(selector => [selector, document.querySelector(selector)?.textContent.replace(/\s+/g, ' ').trim()]));
});
async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'no-preference' });
  // No analytics, external calls, mutations or notifications during browser QA.
  await context.route('**/*', route => {
    const req = route.request(), url = new URL(req.url());
    if (!['GET', 'HEAD'].includes(req.method())) return route.abort();
    if (url.origin !== base) return route.fulfill({ status: 200, body: '', contentType: 'text/plain' });
    if (baselineMode && req.isNavigationRequest() && saved[url.pathname]) return route.fulfill({ status: saved[url.pathname].status, body: saved[url.pathname].html, contentType: 'text/html' });
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const result = { checks: [], errors, preservation: [], links: [], booking: [] };
  const baseline = baselineMode ? {} : JSON.parse(fs.readFileSync(dir + '/education-before.json'));
  await page.addInitScript(() => {
    window.qaLayoutShifts = [];
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.qaLayoutShifts.push(entry.value);
    }).observe({ type: 'layout-shift', buffered: true });
  });
  try {
    const paths = [...Object.keys(guides), '/fca-authorisation-motor-dealers'];
    if (baselineMode) {
      for (const route of Object.keys(saved)) {
        await page.goto(base + route, { waitUntil: 'networkidle' });
        if (guides[route]) baseline[route] = await education(page);
        console.log('Before: ' + route);
      }
      fs.writeFileSync(dir + '/education-before.json', JSON.stringify(baseline, null, 2) + '\n');
      return;
    }
    const links = new Set();
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of paths) {
        const response = await page.goto(base + route, { waitUntil: 'networkidle' });
        assert.equal(response.status(), 200, route);
        const state = await page.evaluate(() => ({
          title: document.title,
          description: document.querySelector('meta[name="description"]').content,
          canonical: document.querySelector('link[rel="canonical"]').href,
          robots: document.querySelector('meta[name="robots"]').content,
          h1: document.querySelectorAll('h1').length,
          headings: [...document.querySelectorAll('main h1,main h2,main h3,main h4')].map(el => ({ level: Number(el.tagName[1]), text: el.textContent.trim() })),
          overflow: document.documentElement.scrollWidth > innerWidth,
          images: [...document.images].map(img => ({ src: img.getAttribute('src'), alt: img.getAttribute('alt'), width: img.getAttribute('width'), height: img.getAttribute('height'), broken: img.complete && img.naturalWidth === 0 })),
          schemas: [...document.querySelectorAll('script[type="application/ld+json"]')].map(el => JSON.parse(el.textContent)),
          breadcrumbs: [...document.querySelectorAll('.guide-breadcrumb li')].map(el => el.textContent.trim()),
          currentBreadcrumb: document.querySelectorAll('.guide-breadcrumb [aria-current="page"]').length,
          hrefs: [...document.querySelectorAll('a[href]')].map(el => el.getAttribute('href')).filter(href => href.startsWith('/') || href.startsWith('#')),
          duplicateIds: [...document.querySelectorAll('[id]')].map(el => el.id).filter((id, i, all) => all.indexOf(id) !== i),
          scripts: [...document.scripts].map(el => el.src).filter(Boolean),
          offers: document.querySelectorAll('.guide-offer').length,
          offerText: document.querySelector('.guide-offer')?.textContent || '',
          bookingHref: document.querySelector('.afc-button').getAttribute('href'),
          bookingCount: document.querySelectorAll('.afc-panel').length,
          ogType: document.querySelector('meta[property="og:type"]').content
        }));
        assert(!state.overflow, 'horizontal overflow: ' + route + ' ' + width);
        assert.equal(state.h1, 1, route);
        assert.deepEqual(state.duplicateIds, [], route);
        assert.equal(new Set(state.scripts).size, state.scripts.length, 'duplicate scripts: ' + route);
        assert.equal(state.bookingCount, 1, route);
        assert(!state.robots.includes('noindex'), route);
        assert.equal(state.canonical, 'https://009compliance.com' + route);
        for (const img of state.images) { assert(!img.broken, img.src); assert(img.alt !== null && img.width && img.height, img.src); }
        for (let i = 1; i < state.headings.length; i++) assert(state.headings[i].level <= state.headings[i - 1].level + 1, 'heading jump: ' + route + ': ' + state.headings[i].text);
        if (guides[route]) {
          const guide = guides[route];
          assert.equal(state.title, guide.seoTitle);
          assert.equal(state.description, guide.description);
          assert.equal(state.ogType, 'article');
          assert.equal(state.currentBreadcrumb, 1);
          const breadcrumb = state.schemas.find(s => s['@type'] === 'BreadcrumbList');
          assert.deepEqual(breadcrumb.itemListElement.map(item => item.name), state.breadcrumbs);
          assert(!state.schemas.some(s => s['@type'] === 'FAQPage'));
          const article = state.schemas.find(s => s['@type'] === 'Article');
          assert(!article.dateModified && !article.datePublished && !article.author);
          assert.equal(article.headline, guide.title);
          assert.equal(state.offers, guide.group === 'ongoing' ? 0 : 1);
          if (guide.group === 'fca') { assert(state.offerText.includes('£600 minimum service commitment')); assert(state.offerText.includes('first payment counts as month one')); }
          else { assert(!state.offerText.includes('£100')); if (guide.group === 'ccr') assert(state.offerText.includes('Priced to scope')); }
          const topic = guide.group === 'fca' ? 'authorisation' : guide.group === 'ccr' ? 'ccr009' : 'ongoing';
          assert.equal(state.bookingHref, '/contact?topic=' + topic + '#book-meeting');
          if (width === 1280) {
            assert.deepEqual(await education(page), baseline[route], 'educational content changed: ' + route);
            result.preservation.push({ route, renderedEducationalTextIdentical: true });
          }
        }
        for (const href of state.hrefs) links.add(new URL(href, base + route).href);
        // Exercise the real intersection animation and verify stable reserved bounds.
        await page.locator('.afc-art').scrollIntoViewIfNeeded();
        await page.waitForFunction(() => document.querySelector('.afc-panel').classList.contains('afc-on'));
        const before = await page.locator('.afc-art').boundingBox();
        await page.waitForTimeout(300);
        const after = await page.locator('.afc-art').boundingBox();
        assert.equal(before.height, after.height); assert.equal(before.width, after.width);
        const animation = await page.locator('.afc-calendar').evaluate(el => getComputedStyle(el).animationName);
        assert(animation.includes('afc-float'), route);
        if (guides[route]?.group !== 'ongoing' && guides[route]) {
          await page.locator('.guide-offer').scrollIntoViewIfNeeded();
          const offerAnimation = await page.locator('.guide-offer .offer-card__orbit').evaluate(el => getComputedStyle(el).animationName);
          assert.notEqual(offerAnimation, 'none', route);
        }
        const cls = await page.evaluate(() => window.qaLayoutShifts.reduce((sum, value) => sum + value, 0));
        result.checks.push({ route, width, status: response.status(), overflow: state.overflow, cls, calendarAnimated: true, offerCount: state.offers, headings: state.headings.length });
        console.log('PASS ' + width + ' ' + route + ' CLS=' + cls.toFixed(4));
      }
    }
    // Follow all internal paths and fragments, including navigation and footer.
    for (const target of links) {
      const url = new URL(target);
      const response = await context.request.get(target, { maxRedirects: 5 });
      assert.equal(response.status(), 200, target);
      if (url.hash) {
        const html = await response.text();
        assert(html.includes('id="' + decodeURIComponent(url.hash.slice(1)) + '"'), 'missing fragment: ' + target);
      }
      result.links.push({ path: url.pathname + url.search + url.hash, status: response.status() });
    }
    // Every affected route also gets reduced-motion and JavaScript-disabled checks.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const route of paths) {
      await page.goto(base + route, { waitUntil: 'networkidle' });
      const animations = await page.locator('.afc-panel *,.guide-offer *').evaluateAll(els => els.flatMap(el => [getComputedStyle(el).animationName, getComputedStyle(el, '::before').animationName]).filter(name => name !== 'none'));
      assert.deepEqual(animations, [], 'reduced motion: ' + route);
      assert(await page.locator('.afc-button').isVisible());
    }
    result.reducedMotionRoutes = paths.length;
    const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    const staticPage = await noJs.newPage();
    for (const route of paths) {
      await staticPage.goto(base + route, { waitUntil: 'domcontentloaded' });
      assert(await staticPage.locator('h1').isVisible());
      assert(await staticPage.locator('.afc-button').isVisible());
      assert((await staticPage.locator('.afc-button').getAttribute('href')).includes('#book-meeting'));
      if (guides[route]) assert.deepEqual(await education(staticPage), baseline[route]);
    }
    result.noJavaScriptRoutes = paths.length;
    await noJs.close();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    for (const route of ['/fca-application-documents-motor-dealers', '/what-is-ccr009', '/consumer-duty-motor-dealers', '/fca-authorisation-motor-dealers']) {
      await page.goto(base + route, { waitUntil: 'networkidle' });
      // Native FAQ summary and CTA activation with keyboard.
      if (guides[route]) {
        const faq = page.locator('#guide-faq details').first();
        await faq.locator('summary').focus(); await page.keyboard.press('Enter');
        assert(await faq.evaluate(el => el.open));
      }
      await page.locator('.afc-button').focus();
      const focus = await page.locator('.afc-button').evaluate(el => ({ active: document.activeElement === el, outline: getComputedStyle(el).outlineStyle }));
      assert(focus.active && focus.outline !== 'none');
      await page.keyboard.press('Enter');
      await page.locator('#book-meeting').waitFor();
      assert(await page.locator('[data-booking-studio]').isVisible());
      result.booking.push({ from: route, destination: page.url(), formVisible: true, topic: await page.locator('[data-bs-topic]').inputValue() });
    }
    // Preview has no booking credentials: verify actual unavailable state, then
    // separately exercise date -> time -> details with a labelled read-only fixture.
    await page.goto(base + '/contact?topic=ccr009#book-meeting', { waitUntil: 'networkidle' });
    await page.locator('[name="demo_date"]').last().check();
    await page.waitForFunction(() => document.querySelector('.bs-app [role="status"]').textContent !== 'Checking availability…');
    result.bookingUnavailable = await page.locator('.bs-app [role="status"]').textContent();
    assert(await page.locator('[data-bs-continue]').isDisabled());
    await page.route('**/api/bookings/availability?*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ times: ['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00'] }) }));
    await page.locator('[name="demo_date"]').last().check();
    // Re-select a different future day to trigger the fixture request.
    await page.locator('[name="demo_date"]').nth(3).check();
    await page.locator('[name="demo_time"]:not(:disabled)').first().check();
    await page.locator('[data-bs-continue]').click();
    assert(await page.getByLabel('Phone number', { exact: true }).isVisible());
    assert.equal(await page.locator('[data-bs-topic]').inputValue(), 'ccr009');
    result.bookingFixture = { dateTimeDetailsPassed: true, submitted: false, liveAvailabilityVerified: false };
    await page.screenshot({ path: dir + '/booking-details-desktop.png', fullPage: false });
    for (const [route, width, selector, name] of [
      ['/what-is-ccr009', 390, '.guide-offer', 'ccr009-offer-mobile'],
      ['/fca-application-documents-motor-dealers', 1280, '.guide-offer', 'fca-offer-desktop'],
      ['/consumer-duty-motor-dealers', 768, '.afc-panel', 'booking-tablet']
    ]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(base + route, { waitUntil: 'networkidle' });
      await page.locator(selector).scrollIntoViewIfNeeded();
      await page.screenshot({ path: dir + '/' + name + '.png' });
    }
    // The intentional 503 above is reported separately from normal-route errors.
    result.errors = errors.filter(error => !error.includes('503'));
    assert.deepEqual(result.errors, [], 'browser errors');
  } finally {
    if (!baselineMode) fs.writeFileSync(dir + '/browser-results.json', JSON.stringify(result, null, 2) + '\n');
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
