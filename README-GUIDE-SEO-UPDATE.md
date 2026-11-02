# Guide content and SEO update — 1 November 2026

## Subsequent dealer-audience clarification

The authorisation-assistance offer now explicitly includes car, motorcycle, van and commercial vehicle dealers. Only the homepage offer description, FCA service introduction, services/pricing descriptions and shared guide offer copy were adjusted, together with matching homepage/FCA metadata and the service audience schema. Titles, URLs, prices, regulatory explanations, layouts, styles and animation code were preserved. All 10 existing integration test groups pass after this clarification. The preservation results below describe the preceding guide-only update, before these specifically requested copy edits.


This package includes the earlier technical SEO work and updates the 18 informational guides only. It has not been deployed to the live website.

## Changes

- Replaced generic and overlapping guide coverage with distinct answers, practical tables, clearly labelled examples and checklists.
- Checked regulatory explanations against current FCA pages and Handbook provisions; added section-level links, source lists and a real source-check date. No invented professional reviewer, accreditation or client outcomes.
- Clarified CCR009 scope, calendar-based periods, the larger-firm exception, 40-business-day submission window, tailored questions and the relationship with CCR007.
- Clarified permission scenarios and application documents; described FCA assessment timescales without calling them average or guaranteed approval times.
- Distinguished actual obligations from suggested internal workflows and monitoring intervals.
- Updated guide-specific titles, descriptions, contextual links, Article metadata and FAQs. Visible FAQs and FAQ structured data share the same data source.
- Added qualified FCA authorisation assistance promotions using the existing offer configuration: £100 first payment, then £100 monthly, six-month minimum (£600 before applicable referral adjustments), separate FCA fee, continuing payments until cancellation under the agreed terms.
- Reused the original animated calendar booking CTA and its original CSS/JavaScript on all 18 guides. Reused the animated offer-card border and existing motor-finance illustration on five relevant guides. Finance arrangements remain explicitly separate, with permissions, onboarding and lender-assessment qualifications.

## Scope preserved

All 15 other public pages rendered byte-for-byte identically to the preceding technical SEO package: homepage, referral, terms, about, testimonials, contact, privacy, complaints, cookies, services, FCA authorisation, CCR009 assistance, ongoing compliance, motor finance and pricing.

No original animation CSS or JavaScript, service template, server route, commercial configuration, portal logic or booking integration was changed. Guide-specific styles are scoped under `.researched-guide`.

## Where future guide edits belong

`config/guide-content.json` is the active guide content source. `views/seo_guide.ejs` renders it. The existing SEO render middleware selects this view only for the 18 explicit guide paths; it replaces their old route-level FAQ schema. Earlier guide templates and route data remain in the repository but are not rendered for those paths. Edit the new data rather than the superseded templates.

`config/seo-pages.json` retains the sitemap and page metadata registry. Keep the corresponding guide title and description entries aligned when editing metadata.

Shared guide promotions are in `views/partials/guide_offer.ejs` and `guide_booking.ejs`. The calendar animation markup matches the original service CTA, with the booking link pointed at `/contact#book-meeting` because the guide has no embedded booking form.

## Verification completed

- Production asset build passed.
- All 10 integration test groups passed (`npm run test:seo`), covering all 33 public pages, metadata, canonicals, assets, redirects, private-page indexing, gzip, contact validation, isolated email delivery, registration/login/terms, and guide FAQ/CTA consistency.
- All guide internal links and target fragments checked; no missing destinations.
- All 18 guides checked in the browser at 320, 390, 768 and 1280 pixels wide (72 checks): no page overflow, broken images or missing primary headings/booking artwork.
- Manually inspected desktop/mobile presentation, expanded FAQ answers, followed a guide CTA to the contact booking section, and verified the calendar and motor-finance animations become active in view.
- Corrected an observed offer-card contrast issue; checked the final light text and qualifications against its dark background.
- Original animation source files and all non-guide public page output preserved.

Browser visual checks used HTML rendered by the real Express/EJS application, served in an isolated preview. Integration tests ran against Express with an isolated database and email sink. Live Google Calendar/Meet bookings, email delivery, Sheets access, and production deployment were not exercised. Keep the existing production environment variables and integrations.

## Installation

Use the `website` directory as the updated application source. Preserve the production `.env`, database, uploads and hosting settings; they are not included in this archive. Do not replace a live database with a test database.

Run `npm ci`, `npm run build`, and `npm run test:seo` in a suitable development environment before deployment. Continue to deploy using the existing Render workflow. No new runtime dependency was introduced.

## Editorial maintenance

The source-check date is 1 November 2026, not a permanent claim that rules cannot change. Recheck FCA sources before later substantive updates. Do not turn the calendar-based reporting guidance into a single universal deadline, or the assessment periods into a promised approval date. Retain the distinction between administrative support and regulated activity.

Named author/reviewer credentials, VAT treatment and a cancellation notice period were not invented. Referral eligibility and discounts remain on the unchanged existing referral page rather than being restated inconsistently in the guides.
