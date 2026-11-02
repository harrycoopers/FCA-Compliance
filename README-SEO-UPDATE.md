# 009 Compliance technical SEO update

Prepared 1 November 2026 for the existing Express/EJS application and Render deployment. No live deployment was performed.

## What changed

- The FCA page title is **FCA Authorisation for Motor Dealers | £100 to Get Started | 009 Compliance**. Its description explains the £100 monthly payment, six-month minimum and separate FCA fee. Prices are read from the existing offer configuration; the title drops the price if that configuration stops showing it.
- All 33 public content pages have individual titles/descriptions, query-free canonical URLs and consistent social metadata. Existing visible headings, copy, prices, sections and testimonials remain intact.
- `config/seo-pages.json` is the shared public-page registry for metadata, URL normalization and the sitemap. Adding a new indexable page requires adding it here as well as registering its route.
- Marketing GET/HEAD requests normalize casing/trailing slashes; known production hosts also normalize HTTPS/www in one hop. The original query string is preserved, including advertising IDs and referral selections. API, OAuth, password tokens and POST requests are not normalized by this rule.
- Robots uses real newlines. The sitemap now contains all 33 public content URLs, including testimonials and motor finance, without fabricated modification dates. Express generates both files; static copies are supplied for tooling.
- Login, registration, password/verification/account screens, private/API responses and 404s have deliberate noindex handling. Private authentication requirements are unchanged. Legal pages have specific metadata.
- Added coherent WebSite/WebPage/BreadcrumbList and relevant Service schema, using existing business facts. Existing genuine FAQ markup remains. No fabricated ratings, authors, review dates or rich-result promises were added.
- Repaired `/pricing#payments` by adding the missing section ID.
- Prevented the 16 shadowed guide handlers from registering. The original first-registered templates remain authoritative, preserving their content.
- Removed the public `/test-email`, `/test-sheets` and `/debug-env` handlers. They now return genuine noindexed 404s.
- Anonymous marketing visits no longer create sessions merely to read empty flash messages. Authenticated/personalised HTML is not publicly cached; utility HTML uses no-store.
- Replaced the development Tailwind browser runtime with locally compiled Tailwind 3.4.17 CSS. The stylesheet insertion order matches the original CDN output.
- Built 57 fingerprinted local CSS/JS assets, with conservative minification and one-year immutable caching. Source CSS/JS is retained unchanged. Added HTTP compression and one-week caching for image/font assets.
- Campaign/Christmas scripts are included only where their existing target elements or sales-page behaviours are present. Every existing animation on its relevant pages is retained, with its original code, timing and reduced-motion behaviour.
- Added `npm run test:seo` and made importing the Express app possible without opening a server. Normal `node server.js` startup is unchanged. The dev server also accepts `--port`.

## Deploy to the existing Render service

1. Keep the existing deployment/environment settings and persistent database. This archive deliberately excludes `.env`, `db.sqlite`, dependency directories and local QA fixtures. It contains no replacement customer database.
2. Apply the contents of `website/` to the existing application's root, including `config/`, `scripts/`, `assets/`, `public/build/`, templates, `package.json` and `package-lock.json`.
3. Set the build command to `npm ci && npm run build`. Use the existing supported Node runtime. The new build packages are production dependencies, so an install that omits dev dependencies can still build.
4. Keep the start command `node server.js` or `npm start`. Render supplies `PORT`. Keep `CANONICAL_BASE_URL=https://009compliance.com` (or leave it unset for that default).
5. Keep the existing `DB_PATH`, session, email, Google Sheets and booking configuration. Restart the application after rebuilding so it loads the new asset manifest.
6. Check the public FCA page, one guide, login, robots and sitemap after deployment. Test one legitimate enquiry and booking using your production integrations. Submit the sitemap and inspect the FCA URL in Search Console.

Generated assets and their manifest are included, but future CSS/JS/template utility changes must run `npm run build` again. Edit source CSS/JS, not the fingerprinted copies. Retain old fingerprinted assets across rolling deployments until old HTML requests have finished; they are harmless and content-addressed.

## Verification completed

| Check | Result |
| --- | --- |
| Public content routes | All 33 returned 200 with unique metadata, one canonical and one H1 |
| Content preservation | All 36 public/utility page bodies matched the originals, allowing only asset references/inactive script removal and the new payments ID |
| Original assets and business data | Every original CSS, JavaScript, image, font, data and configuration source file unchanged |
| Internal anchor destinations | No missing fragments among the rendered public pages |
| Structured data | Every JSON-LD block parsed; no duplicate schema types introduced on tested pages |
| Asset delivery | Referenced local build/font/image files returned 200; hashed assets had immutable caching; gzip verified |
| Integration regression suite | All 8 test groups passed using real Express/EJS/SQLite/bcrypt and an isolated database |
| Authentication/forms | Registration, terms flow, login, logout, flash consumption, private-page protection, report-form rendering, contact validation and successful mocked enquiry delivery passed |
| Redirects | 33 production URL variants, preserved query strings, canonical requests, HEAD, local preview, POST and token/OAuth exclusions passed |
| Campaign timing | FCA page tested before and after the existing Christmas deadline |
| Desktop browser | All 33 public pages opened in Chrome with one H1, no detected broken loaded images and no horizontal document overflow |
| Visual comparison | Homepage heading/section metrics matched the original; FCA headings matched and section dimensions matched within 0.001px rounding |
| Responsive browser inspection | FCA inspected at 320, 390, 768 and 1024px iframe widths; desktop at 1363px. Home, pricing and contact also inspected at 390px. No overflow in these checks |
| Manual interactions | Mobile menu/navigation, FCA payment jump, pricing payments jump, referral slider, accordion, testimonial navigation/full-review open/close, contact required-field validation and unconfigured booking message checked |

The responsive checks used Chromium frames, not physical iPhones/Android devices. No iOS Safari/device certification or production Core Web Vitals result is claimed. Browser extension errors were excluded from application-error observations.

## Remaining items outside this content-preserving code update

- **Production access:** email delivery, Google Calendar/Meet invitations, Sheets synchronization, live DNS/TLS/proxy behaviour, Search Console indexing and GA4 attribution require checks on the actual deployment. The local booking service correctly reported that Google Meet was not connected; no real booking or email was sent.
- **Content accuracy:** the audit's CCR007/complaints wording on the two service pages remains flagged for a separate factual correction. It was not silently rewritten in this update because visible copy was to be preserved. The wider guide improvements and regulatory examples also require reviewed content.
- **Business decisions:** VAT treatment, cancellation summaries, service-scope explanations and what genuinely ends with the Christmas promotion remain as supplied. No new commercial terms were invented.
- **Authority/content:** real author biographies, reviewer credentials, dated review sources, permissioned case studies and industry mentions need genuine business evidence. No invented authority signals were added.
- **Further performance work:** measured unused-CSS restructuring, alternative logo formats and revised social graphics remain optional follow-up work. Existing custom rules were not purged speculatively. The 56 existing local CSS/JS files totalled 483,770 bytes; their generated copies total 454,611 bytes before gzip. The separate compiled Tailwind asset replaces the browser runtime. These are file-size measurements, not a claimed field-speed improvement.
- **Analytics/privacy:** acquisition query strings now survive redirects. New lead-event instrumentation and a consent-policy implementation were not bundled into the SEO change; they need review of your existing analytics/consent setup.

Technical improvements cannot guarantee rankings or force Google to show the exact title. Monitor indexed canonicals, search queries, clicks and qualified enquiries after deployment.

## Maintenance references

- [Google: canonical URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Google: title links](https://developers.google.com/search/docs/appearance/title-link)
- [Tailwind v3: content configuration](https://v3.tailwindcss.com/docs/content-configuration)

The detailed regression output and preservation results are in `docs/seo-verification/`.
