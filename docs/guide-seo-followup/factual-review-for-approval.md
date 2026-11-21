# Factual clarification and proposed corrections — 12 November 2026

**Current instruction: DO NOT APPLY.** The user has explicitly declined all five proposed replacements and instructed that substantive guide content remain unchanged. The proposals and conditional commit/deployment procedure below are retained only as a historical review record, not as an active instruction or authorisation. No replacement has been applied. The final combined SEO result is recorded in [README-GUIDE-SEO-FINAL.md](../../README-GUIDE-SEO-FINAL.md); the factual concerns remain outstanding.

No application copy, metadata, dates, configuration or deployment was changed during this review. The replacements below are proposals for approval. All 33 registered public routes were rendered locally to locate the statements; the live FCA Handbook was also read with JavaScript enabled.

## 1. FCA timing — ambiguous/incomplete wording

The existing guide accurately reflects the FCA's general [application page](https://www.fca.org.uk/firms/authorisation/apply), which still gives six/twelve months. However, the FCA's latest [2026/27 Q1 operating metrics](https://www.fca.org.uk/data/fca-authorisations-operating-service-metrics-2026-27-q1), published 2 October 2026, use a 95% four-/ten-month target for new Part 4A authorisations. See row A1.1 in the [official metrics PDF](https://www.fca.org.uk/publication/data/authorisations-operating-service-metrics-2026-27-q1.pdf). Its notes say the older standards are no longer reported where tighter deadlines have been introduced.

Classification: the old numbers are not invented and an application can still take that long. But presenting them alone as the current assessment expectation omits the newer operational target. This is a substantive clarification worth making before release, not a cosmetic SEO change. The proposed wording calls these operating targets; it does not claim legislation has changed, give an average, or guarantee approval.

### /why-fca-applications-get-delayed — introductory answer

URL: https://009compliance.com/why-fca-applications-get-delayed

Source: config/guide-content.json, answer, line 832.

**Existing, exact:**

> FCA applications can take longer when the regulator needs missing information, clarification or evidence that the firm is ready to operate. The FCA says it usually assesses a complete FSMA application within six months; an incomplete application can take up to twelve months. These are published assessment timescales, not a guaranteed approval date.

**Proposed replacement:**

> FCA applications can take longer when the regulator needs missing information, clarification or evidence that the firm is ready to operate. For new Part 4A authorisation applications, the FCA’s current published operating target is to determine 95% of complete applications within four months and incomplete applications within ten months. These are targets, not average approval times or a guaranteed decision date; some applications take longer.

### Same URL — first FAQ answer

The question remains unchanged: “Is six to twelve months the average approval time?”

**Existing, exact:**

> No average is established by this guide. The FCA publishes assessment timescales of usually within six months for a complete FSMA application and up to twelve months for an incomplete one.

**Proposed replacement:**

> No. This guide does not establish an average approval time. The FCA’s current published operating target for new Part 4A authorisations is to determine 95% of complete applications within four months and incomplete applications within ten months. A target is not a guaranteed approval date.

Add the current metrics source beside the changed explanation and to this guide’s source list; retain the general application source for the other application-readiness advice. Any source-check/revision-date treatment must be recorded truthfully for this approved substantive update, not applied to unchanged guides.

### /fca-authorisation-motor-dealers — offer-card timing message

URL: https://009compliance.com/fca-authorisation-motor-dealers

Source: views/partials/offer_card.ejs, line 60. This partial is rendered on this service route; the 18 guide offer cards use a different partial.

**Existing, exact (bold text followed by supporting text):**

> FCA applications can take 6–12 months.
>
> Timing depends on the application’s completeness and complexity. Approval is not guaranteed.

**Proposed replacement:**

> FCA assessment times vary.
>
> The FCA’s operating target for new Part 4A authorisations is to determine 95% of complete applications within four months and incomplete applications within ten months. Approval and timing are not guaranteed.

Link “FCA’s operating target” to the official metrics page. Keep the commercial six-month minimum and every approved payment term unchanged. The service-card statement is not literally false, but risks implying a typical six-to-twelve-month range; the replacement makes the distinction explicit.

No other active route was found publishing this six/twelve-month assessment claim. Mentions of the six-month subscription in /pricing, /referral, /terms and guide offers are commercial terms, not regulator targets, and do not need this correction. /pricing already explicitly says the contract term is not an FCA decision timetable.

## 2. CCR009 £5 million — confirmed overstatement of the ongoing rule; a separate first-period ambiguity

The [FCA CCR009 overview](https://www.fca.org.uk/firms/consumer-credit-reporting/ccr009), updated 1 October 2026, uses the inclusive threshold. But the current live [SUP 16.12.29CR, Note 12](https://handbook.fca.org.uk/handbook/sup16/sup16s41), read with JavaScript enabled on 12 November, distinguishes:

- (c): annual reporting for relevant activity revenue at or below £5 million;
- (d): twice-yearly reporting above £5 million;
- (e): the two reporting periods are January–June and January–December, not two separate six-month datasets;
- (g)/(h): overlapping inclusive thresholds at exactly £5 million in first-period provisions for firms entering scope in January–June from 2026.

These provisions are also visible in the FCA’s made rules, [PS25/3, PDF pages 38–39](https://www.fca.org.uk/publication/policy/ps25-3.pdf#page=38). The current browser-read excerpt is saved in fca-handbook-current.json. The source conflict is real; it should not be resolved by asserting that every firm at exactly £5 million files twice annually, or that all first-period cases are unambiguously annual.

Classification: the blanket statement is incorrect as a summary of the ongoing rule at exactly £5 million. There is also an unresolved ambiguity in the first-period provisions and FCA summary. Recommend a qualified correction before release, with firms at the exact boundary directed to confirm their schedule with the FCA. No contact with the FCA has been made on the user's behalf.

### /when-is-ccr009-due — introductory answer

URL: https://009compliance.com/when-is-ccr009-due

Source: config/guide-content.json, answer, line 2319.

**Existing, exact:**

> Most firms submit CCR009 annually, using a calendar-year reporting period. Firms with annual revenue of £5 million or more from credit-related regulated activities report every six months. The FCA gives a 40-business-day submission window. Check your firm’s My FCA task list and reporting schedule for the exact period and due date.

**Proposed replacement:**

> Most firms submit CCR009 annually, using a calendar-year reporting period. Under the ongoing reporting rule in SUP 16.12.29CR, Note 12(c)–(e), firms with annual revenue from credit-related regulated activities of £5 million or less report annually; firms above £5 million report twice a year, for January–June and January–December. Separate first-period rules apply. At exactly £5 million, confirm the applicable schedule with the FCA because its summary conflicts with the ongoing rule and its first-period provisions overlap at that boundary. The FCA gives a 40-business-day submission window. Check your firm’s My FCA task list and reporting schedule for the exact period and due date.

### Same URL — “Larger-firm exception” table cell

Source: config/guide-content.json, sections[0].rows[1][1], line 2336.

**Existing, exact:**

> Six-monthly reporting where annual credit-related regulated activity revenue is £5 million or more.

**Proposed replacement:**

> Under the ongoing rule, firms with annual credit-related regulated activity revenue above £5 million report twice a year, for January–June and January–December. Separate first-period rules apply; confirm the schedule with the FCA at exactly £5 million.

The threshold FAQ asks whether vehicle-sales turnover supplies the threshold and correctly directs readers to credit-related regulated revenue. It does not decide the equality boundary and need not be changed. /ccr009-vs-ccr007 says “Usually annual; qualifying larger firms report every six months.” That is a frequency summary, not an assertion that the December dataset covers only six months or that the equality boundary is inclusive. Explaining the periods there too would be optional consistency work; no separate confirmed boundary error was found there or in the other 16 guides.

## Local visual previews

The isolated preview is running at http://127.0.0.1:3099 with production credentials and notification delivery disabled. The in-app browser connection failed; these links open the actual animated pages in a normal browser:

- FCA application documents: http://127.0.0.1:3099/fca-application-documents-motor-dealers#guide-offer-title — offer after the final educational section, before FAQs; calendar booking CTA at the end.
- CCR009 checklist: http://127.0.0.1:3099/ccr009-reporting-checklist-motor-dealers#guide-offer-title — relevant reporting offer after the final educational section; calendar booking CTA at the end.
- Consumer Duty: http://127.0.0.1:3099/consumer-duty-motor-dealers#auth-final-title — closing calendar CTA, without an FCA application offer.

All three returned 200; offer orbit and calendar animation names were verified in the rendered page. Fresh screenshots: preview-fca-guide.png, preview-ccr009-guide.png, preview-consumer-duty.png. Screenshots are static; use the links to assess motion. Nothing in the preview includes the proposed factual replacements.

## Readiness and verified commit/deployment procedure

Ready for visual review now. Not yet cleared for publication: the CCR009 ongoing-rule correction and the timing clarification above await approval. No code correction, commit, push, deployment or indexing request was performed during this clarification.

Repository: origin https://github.com/harrycoopers/FCA-Compliance.git; current branch main. README-SEO-UPDATE.md lines 23–30 identify the existing Render service. No Render service ID, deployment hook or live auto-deploy configuration is present in the inspected repository; a push to the linked branch may deploy automatically. Do not execute the publication step until separately approved.

After approving and implementing the exact corrections, run from C:\Users\Harry\Downloads\FCA-Compliance-publish:

```powershell
npm.cmd run build
npm.cmd test
git diff --check
git add -- .gitignore config/asset-manifest.json config/guide-content.json config/seo-pages.json config/guide-links.json public/css/guide-content.css "public/build/guide-content.*.css" tests/seo.test.cjs utils/seo.js utils/guide-links.js views/fca_authorisation_motor_dealers.ejs views/layout.ejs views/seo_guide.ejs views/partials/guide_booking.ejs views/partials/guide_offer.ejs views/partials/guide_reporting_offer.ejs views/partials/offer_card.ejs "scripts/guide-seo-*.cjs" README-GUIDE-SEO-REVIEW.md README-GUIDE-SEO-FOLLOWUP.md docs/guide-seo-2026-11 docs/guide-seo-followup
git diff --cached --check
git diff --cached --stat
git diff --cached
git commit -m "Improve guide SEO, contextual navigation and pricing fallbacks"
```

This explicit staging list excludes the unrelated untracked file, .env, database files and .qa. Approved substantive corrections require narrowly documented preservation-test exceptions; do not disable the content-preservation checks. Repeat local rendered/browser checks for affected pages before committing. The original sources must remain as the before baseline.

Only after publication approval and confirming the existing Render service uses this repository's main branch:

```powershell
git push origin main
```

Use the existing service's configured auto-deploy or its manual deployment control; its build command documented in the repository is `npm ci && npm run build`, and its start command is `node server.js` (or `npm start`). The current checkout is already the application root; the older README's website/ wording refers to an archive directory, not an extra directory to create here. Retain production DB_PATH/persistent disk, session secret, canonical origin, email/Sheets/booking configuration and Render's supplied PORT. Use the repository's backup procedure before release; do not copy this local SQLite database over production.

After release, inspect the three pages, pricing/service page, robots and sitemap without submitting a booking or enquiry. The older README's recommendation to submit the sitemap and test live bookings does not override the user's separate-authorization requirement. No exact Render service-specific CLI command can be verified from this checkout.
