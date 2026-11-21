'use strict';
// Read-only live booking check. Never fills personal details or submits a form.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '../.qa/node_modules/playwright-core');
const fs = require('node:fs');
const assert = require('node:assert/strict');
async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const result = { live: true, submitted: false, blockedMutations: [], errors: [] };
  await context.route('**/*', route => {
    const request = route.request();
    if (!['GET','HEAD'].includes(request.method())) {
      result.blockedMutations.push({ method: request.method(), url: request.url() });
      return route.abort();
    }
    if (!['009compliance.com','www.009compliance.com'].includes(new URL(request.url()).hostname)) return route.fulfill({ status: 200, body: '' });
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => result.errors.push(error.message));
  try {
    const pricing = await page.goto('https://009compliance.com/pricing', { waitUntil: 'networkidle', timeout: 45000 });
    result.pricingStatus = pricing.status();
    result.pricing = await page.locator('.ps-price').allTextContents();
    assert(result.pricing.join(' ').includes('£600 minimum service commitment'));
    const response = await page.goto('https://009compliance.com/contact?topic=ccr009#book-meeting', { waitUntil: 'networkidle', timeout: 45000 });
    result.contactStatus = response.status();
    assert.equal(response.status(), 200);
    await page.locator('[data-booking-studio]').waitFor();
    assert(await page.locator('[data-booking-studio]').isVisible());
    const availabilityResponse = page.waitForResponse(r => r.url().includes('/api/bookings/availability?'));
    await page.locator('[name="demo_date"]').last().check();
    const availability = await availabilityResponse;
    result.availabilityStatus = availability.status();
    result.availability = await availability.json();
    if (availability.ok()) {
      await page.locator('[name="demo_time"]:not(:disabled)').first().check();
      await page.locator('[data-bs-continue]').click();
      result.detailsVisible = await page.getByLabel('Phone number', { exact: true }).isVisible();
      result.topic = await page.locator('[data-bs-topic]').inputValue();
      assert(result.detailsVisible);
      assert.equal(result.topic, 'ccr009');
    } else {
      result.unavailableMessage = await page.locator('.bs-app [role="status"]').textContent();
    }
    await page.screenshot({ path: 'docs/guide-seo-2026-11/live-booking.png' });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    fs.writeFileSync('docs/guide-seo-2026-11/live-booking-results.json', JSON.stringify(result, null, 2) + '\n');
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
