# Implementation plan: SEO and GEO, from the 21 November 2026 audit

Each item lists:
- **Impact:** high, medium or low effect on qualified UK dealer enquiries
- **Confidence:** how strongly the evidence supports the item
- **Effort:** S = up to half a day, M = 1–2 days, L = more than 2 days
- **Dependencies**
- **URLs**
- **Files**
- **Acceptance test**

Where a shared template is involved, the items are grouped so one root cause is fixed once. Content changes to guides should follow the existing evidence process. That means: edit `docs/<release>/apply-content.cjs`, record before/after values and sources in `content-evidence.json`, and pass `npm test` and `node scripts/release-final-check.cjs`.

---

## Immediate: before or with the next deployment

### I-1. Deploy the committed branch and notify search engines
- **Impact:** high · **Confidence:** high · **Effort:** S · **Depends on:** nothing
- **URLs:**
  - the 6 new guides
  - `/guides`, `/llms.txt`, the IndexNow key file
  - every page changed in commits `14b1a3e`–`cde423d`
- **Files:** none
- **Steps:**
  1. Deploy.
  2. Submit `https://009compliance.com/sitemap.xml` in Google Search Console and Bing Webmaster Tools.
  3. Run `node scripts/indexnow.cjs --dry-run <paths>`, then the same command without `--dry-run`, listing every page added or changed in the release.
  4. Request indexing in URL Inspection for the 6 new guides.
- **Acceptance:**
  - `node audits/2026-11-21-seo-geo/tools/crawl.cjs live` reports 40 indexable content pages, the live sitemap has 40 URLs, and `/36341005a716865fb5c566c8d7418ce1.txt` returns 200.
  - The live homepage Organization JSON-LD contains `description`, `areaServed` and `sameAs`.

### I-2. "Our fees and the FCA's fees" (one config change, three templates)
- **Impact:** high · **Confidence:** medium–high · **Effort:** M · **Depends on:** nothing
- **URLs:** `/fca-authorisation-motor-dealers`, `/pricing`, `/` (homepage FAQ and its FAQPage schema)
- **Root cause:** FCA figures live only in the cost guide's JSON. Service templates can't reuse them, so they say "paid separately" and give no figure.
- **Files:**
  - `config/offer.js`: add `fcaFees: { application: 560, applicationCategory: 2, minimumAnnual2026_27: 1100, checked: '2026-11-21', source: 'https://www.fca.org.uk/firms/authorisation/apply/fees', annualSource: 'https://www.fca.org.uk/firms/fees-and-levies/fee-movements' }`
  - `views/fca_authorisation_motor_dealers.ejs`: new block under `#payments`
  - `views/pricing.ejs`: the FCA-fee line under the authorisation price card
  - `data/faqs.js`: the home FAQ "How much will the support cost?"
- **Before (homepage FAQ, `data/faqs.js`):**
  > Fees depend on the service and agreed scope. We explain the charges and any ongoing commitment before you proceed. Current FCA authorisation assistance terms are available on the authorisation page.
- **After** (rendered from `offer` and `campaign.showPrice`; the existing fallback copy applies when prices are hidden):
  > FCA authorisation assistance is £100 to get started, then £100 a month by Direct Debit, with a six-month minimum (£600). The FCA's own application fee is separate and paid to the FCA. CCR009 return assistance and ongoing compliance support are priced to the scope we agree with you.
- **After (offer-page block):**

  | | Paid to | Amount | When |
  |---|---|---|---|
  | 009 Compliance FCA authorisation assistance | 009 Compliance | £100 to start, then £100/month; six-month minimum (£600) | Monthly by Direct Debit |
  | FCA application fee (limited permission, Category 2) | The FCA | £560, non-refundable | When you submit in Connect |
  | FCA annual fee (limited permission, 2026/27 minimum) | The FCA | From £1,100 a year, plus levies | Invoiced from July each year |

  *FCA fees checked 21 November 2026: [FCA application fees](https://www.fca.org.uk/firms/authorisation/apply/fees) · [FCA 2026/27 fee movements](https://www.fca.org.uk/firms/fees-and-levies/fee-movements). [FCA fees explained →](/fca-authorisation-cost-car-dealers)*
- **Acceptance:**
  - Each of the three pages shows our terms and the FCA fees in separate rows or sentences, and every FCA figure has a "checked" date and an FCA link.
  - Homepage FAQPage JSON-LD equals the visible FAQ.
  - The existing price-gating tests pass in all four campaign states: with prices hidden, there's no `£` in our-price copy.
  - Extend `scripts/release-final-check.cjs` so that any page showing "£560" or "£1,100" also shows "FCA fees checked".

### I-3. First-party enquiry source capture
- **Impact:** high (it measures everything else) · **Confidence:** high · **Effort:** M · **Depends on:** a privacy-policy wording update
- **URLs:** all public pages (capture), `/contact` (storage)
- **Files:**
  - `server.js`: middleware after the session is set up. On a visitor's first public GET, store `req.session.firstTouch = { path, referrerCategory, at }`.
  - `booking/service.js`: add `source_path` and `source_referrer` columns to `meeting_bookings`, following the existing `PRAGMA table_info` migration pattern.
  - The `app.post('/contact', …)` handler (`server.js:426`): include both fields in the enquiry email and stored record.
  - `views/privacy_policy.ejs`: one sentence on what's stored.
- **Referrer categories:** store host only, never the full URL or query.
  - `google`, `bing`, `duckduckgo`, `ecosia`
  - `chatgpt` (chatgpt.com, chat.openai.com)
  - `perplexity` (perplexity.ai), `copilot` (copilot.microsoft.com), `gemini` (gemini.google.com), `claude` (claude.ai)
  - `direct` (no referrer), `internal`, `other:<host>`
- **Privacy:** no new cookies (the session cookie already exists), no third parties. AI referral visits, AI citations and enquiries stay separate measures.
- **Acceptance:**
  - In the isolated test DB, a booking created after landing on `/what-is-ccr009` with `Referer: https://www.google.com/` stores `source_path=/what-is-ccr009` and `source_referrer=google`.
  - A query string in the referrer is never stored.
  - `npm test` passes, with a new test in `tests/booking.test.cjs`.

### I-4. P1 internal links
- **Impact:** medium–high · **Confidence:** medium · **Effort:** S · **Depends on:** I-1 for the new destinations to be live
- **Rows:** the 8 P1 additions in `INTERNAL-LINKS.csv`. The two "keep (local only – deploy)" rows ship with I-1.
- **Files:**
  - Service pages: `views/fca_authorisation_motor_dealers.ejs`, `views/pricing.ejs`, `views/motor_finance.ejs`, `views/ccr009_return_assistance_motor_dealers.ejs`
  - Guides: `config/guide-content.json` section `links` arrays (via the evidence script)
  - Homepage FAQ: `data/faqs.js`
- **Acceptance:**
  - Recrawl local. Contextual inlinks: `/fca-authorisation-cost-car-dealers` ≥ 6, `/what-is-ccr007` ≥ 5, `/how-to-offer-car-finance-dealers` ≥ 6, `/how-to-apply-fca-limited-permission-car-dealers` ≥ 12.
  - The release gate still reports 0 broken links.

### I-5. Shared template: replace the vague "Learn More ↗" anchor
- **Impact:** low–medium · **Confidence:** high · **Effort:** S
- **URLs:** every FCA guide and `/fca-authorisation-motor-dealers`
- **File:** `views/partials/referral_animation.ejs`
- **Before:** `Learn More ↗` → `/referral`
- **After:** `How the referral discount works ↗` → `/referral`
- **Acceptance:** no anchor matching `/^(learn more|read more|click here|more)$/i` in the main or aside region of any page. Add this to the release gate.

### I-6. Remove `/api/metrics` and the dead counter
- **Impact:** low (privacy and housekeeping) · **Confidence:** high · **Effort:** S
- **Files:** `server.js:350`; `public/js/main.js` lines 4–25 (`#user-count` block)
- **Acceptance:** `GET /api/metrics` returns 404, `npm run build` and `npm test` pass, and the security test still covers all public pages.

---

## Next 30 days

### N-1. Answer-first openings for five guides (one evidence batch)
- **Impact:** medium · **Confidence:** medium · **Effort:** M (wording plus a regulatory review)
- **Pages and target wording** (from AUDIT.md §5.3):
  - `/who-needs-to-submit-ccr009`: open with the FCA's own statement that limited-permission firms with credit broking (and the other listed permissions) must submit CCR009 plus a reduced CCR007.
  - `/what-is-ccr009`: say who files, since when (7 May 2025), the calendar-year period, the 40 business days and the £5m twice-yearly rule.
  - `/why-fca-applications-get-delayed`: add FSMA s.55V, the 95% four/ten-month target and the Q1 2026/27 median of 131 days (all new Part 4A firms, April–June 2026), dated and attributed.
  - `/limited-permission-fca-authorisation-motor-dealers`: give the direct conditional answer, including when full permission is needed.
  - `/common-ccr009-reporting-mistakes`: list the errors first and move the frequency caveat out of the opening.
- **Files:** `config/guide-content.json` (via a new `docs/<release>/apply-content.cjs`), `content-evidence.json`
- **Acceptance:**
  - Each opening's first sentence answers the H1 question without needing the next sentence.
  - Every number in the opening has its source in that guide's sources list.
  - `npm test`: the evidence test passes with new records dated on the day the sources are checked.
  - Rerun the AI test set prompts 9, 10 and 5 and record results (§Measurement).

### N-2. CCR009 service page: "Does CCR009 apply to you?"
- **Impact:** medium · **Confidence:** medium · **Effort:** S
- **URL:** `/ccr009-return-assistance-motor-dealers`
- **File:** `views/ccr009_return_assistance_motor_dealers.ejs`
- **Content:** a three-row table.
  1. Directly authorised with credit broking (including limited permission): CCR009 plus reduced CCR007.
  2. Appointed representative: your principal normally reports your activity.
  3. Not sure: check RegData or My FCA.
  Link the three rows to `/who-needs-to-submit-ccr009`, `/what-is-ccr007` and `/when-is-ccr009-due`.
- **Acceptance:** the block renders server-side, each row links its guide, and there's no price in the block.

### N-3. Entity consistency
- **Impact:** medium for GEO · **Confidence:** medium · **Effort:** S · **Depends on:** your decision on E1
- **Experience wording (E2):** use one statement, "Our team brings 30+ years in the motor trade", in:
  - `views/index.ejs:86` (home service card: "30+ years of motor-finance experience")
  - `views/services.ejs`
  - `views/motor_finance.ejs`
  - `config/seo-pages.json` (`/motor-finance-for-dealerships` description)
  If both claims are true, state both explicitly instead.
- **E1 (optional):** one factual line on About naming the person clients deal with and their role. No career history, in line with your decision.
- **Profiles:** create a LinkedIn company page. Then add it to `config/site-identity.json` (`companyLinkedIn`), which feeds Organization `sameAs`.
- **Acceptance:** `grep -rn "30+ years" views config` returns one phrasing, and Organization `sameAs` lists every live official profile.

### N-4. P2 and P3 internal links
- **Rows:** the 13 P2 and P3 additions in `INTERNAL-LINKS.csv`. The one repair is covered by I-5.
- **Effort:** S
- **Acceptance:** `/about` ≥ 2 contextual inlinks and `/van-commercial-vehicle-dealers-fca-permissions` ≥ 5.

### N-5. Measurement baseline
- **Impact:** high for decision-making · **Effort:** S
- **Exports:**
  1. Search Console Performance, 16 months, Page + Query, UK, by device
  2. Page indexing report
  3. Links report
  4. Bing Webmaster Tools Search Performance
- **Save to:** `docs/search-data/2026-12/`
- **Acceptance:** the files exist, plus a short README naming the date range and filters.

### N-6. Housekeeping
- `data/competitors.js`: CreditLicence is now £1,195, not £995. Recheck all three providers, or delete the file and `views/partials/comparison.ejs` if you won't use them.
- Add release-gate rules:
  - each guide has ≥ 4 contextual inlinks
  - no vague anchors
  - FCA fee figures always carry a checked date
  - fail if `data/competitors.js` `checked` is more than 30 days old while `comparison.ejs` is included anywhere

---

## Following 60 days

| ID | Item | Impact / confidence / effort | Files | Acceptance |
|---|---|---|---|---|
| L-1 | Decide whether to merge `/fca-compliance-motor-dealers-guide` into `/guides` (AUDIT.md §3.3) using 90 days of page-level data | M / M / M | `config/guide-content.json`, `config/seo-pages.json`, `utils/guide-navigation.js`, 301 in `server.js` | If merged: a single 301, no internal link to the old URL, and the sitemap updated |
| L-2 | Run the 18-prompt AI test set monthly (AUDIT.md §5.4). Log results in `audits/ai-tests/YYYY-MM.csv` with prompt, platform, date, mention (Y/N), cited URL and competing sources | M / M / S each month | new log | Three monthly runs logged. Mentions and citations kept as separate columns. |
| L-3 | Earned mentions: a CCR009 deadline explainer pitched to trade press (Car Dealer Magazine, AM Online), lender/partner resource listings, and checking trade-association directory eligibility | M / L / M | none | Each link is logged as verified (URL live) or prospective |
| L-4 | Retitle pages that get near-page-one queries once page+query data exists ("fca authorisation for car finance", "dealer compliance", "ccr009") | M / M / S | `config/guide-content.json` / `config/seo-pages.json` | CTR for each target query rises 28 days after the change (Search Console, UK) |
| L-5 | FCA fee-year refresh: the FCA publishes the 2027/28 rates around July 2027. Re-verify the £560 and £1,100 figures and all "checked" dates every quarter | M / H / S | `config/guide-content.json`, `config/offer.js` (`fcaFees`) | Checked dates are less than 120 days old |
| L-6 | Optional: a single-hop redirect for `http://www` at Cloudflare; consider dropping the anonymous session cookie on public pages to allow edge caching | L / M / S | Cloudflare; `server.js` session config | `curl -I http://www.009compliance.com/` takes one hop to the apex |

---

## Shared-template groups (fix once)

| Root cause | Fix | Pages affected |
|---|---|---|
| FCA fee figures exist only in guide JSON | `config/offer.js` `fcaFees` (I-2) | Offer page, /pricing, homepage FAQ, and any future comparison |
| Vague referral anchor | `views/partials/referral_animation.ejs` (I-5) | 12+ pages |
| No enquiry attribution | Session first-touch middleware plus booking/contact columns (I-3) | Every enquiry |
| Inconsistent experience claim | One phrase across 4 templates/configs (N-3) | Home, services, motor finance, About |

---

## Measurement plan

| Measure | Source | Baseline (28 days to 10 Nov 2026) | Review |
|---|---|---|---|
| Non-brand UK clicks to guides and service pages | Search Console, UK, query excludes "009" | 2 non-brand clicks in the query table. Most clicks are not attributed to a query (anonymised). | Monthly |
| CTR for "do car dealers need fca authorisation to offer finance" | Search Console query filter | 0.65% at position 4.1 | 28 days after I-1 |
| Impressions for the 6 new guides | Search Console, page filter | 0 (not live) | 28 and 90 days after I-1 |
| Position for "fca limited permission application", "fca credit broking permission", "ccr009" | Search Console | 20.9 / 42.4 / 15.2 | Monthly |
| Enquiries by landing page and referrer category | Bookings/contact records (I-3) | None recorded | Monthly, from 30 days after I-3 |
| AI mentions vs citations (kept separate) | AI test log (L-2) | Untested | Monthly |
| AI-assistant referral visits leading to enquiries | `source_referrer` in (chatgpt, perplexity, copilot, gemini, claude) | None recorded | Monthly |

Don't combine these into a single score. A citation, a referral visit and an enquiry are different events.
