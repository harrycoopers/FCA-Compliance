# Mobile update — 1 November 2026

This is the complete website based on `009-Compliance-Security-Patched(1).zip`. It has not been deployed. Read the existing security-update documentation as well before configuring a production environment.

## Changes

- Mobile navigation now stays within the usable viewport, scrolls when necessary, locks the background, contains keyboard focus, closes with Escape or navigation, and resets when returning to desktop width.
- Header and floating meeting CTA account for safe-area insets. Anchor and field scrolling account for the header height. The CTA becomes inert when hidden and stays out of the way around forms, the booking/message sections, the footer, open menus, focused fields and a substantially reduced visual viewport.
- Report history becomes labelled cards on narrow screens, retaining every column, record and edit link. Desktop tables remain tables. Long portal text and messages can wrap within their containers.
- Account and report fields have associated labels, suitable autocomplete/input hints, and more comfortable narrow-screen spacing. Password-reset messages only occupy space when present.
- Booking arrows and time controls have larger tap targets. Inputs and the month selector use 16px text. At widths up to 380px, the month selector occupies its own row so the full month and year remain readable.
- Mobile referral results stack the price and percentage clearly, keeping the slider, animated numbers, tier graphics and full offer conditions.
- Guide summaries remain available on mobile; long sidebar text wraps. Comparison tables retain their own horizontal scrolling region rather than forcing the entire page to scroll sideways.
- Process animations retain their artwork, sequences and replay policy. Visibility checks also accommodate short viewports where the original required proportion might never fit. Existing reduced-motion rules remain in place.
- Production assets were rebuilt and the fingerprint manifest updated. No blanket horizontal overflow hiding was added.

Public page wording, offers, prices, legal text, SEO configuration, brand fonts and colours were retained. No production backend, booking service, authentication, database, CSRF, session, report-revision or Google Sheets retry implementation was changed. The existing security test file only gained additional optional isolated rendering fixtures.

## Verification

`npm run build` succeeded. `npm test` passed all 47 tests, including security, customer-data isolation, authentication/verification, report revisions, booking safeguards, Sheets retry behaviour, SEO routes, template/JavaScript syntax and generated-asset hashes.

A local browser QA harness rendered the actual application templates using an isolated temporary database and dummy users/reports. External email, Google Calendar, Google Sheets and analytics calls were blocked or mocked. The preview was not the live website.

- 53 routes and rendered states were checked at 12 viewport sizes: 636 layout checks.
- Sizes: 320×740, 360×800, 375×812, 390×844, 414×896, 430×932, 768×1024, 1024×768, 1280×800, 1440×900, 844×390 and 667×375.
- After the final component changes, the homepage, FCA authorisation, referral, contact/booking, dashboard, report form and an application-documents guide were rechecked at all 12 sizes: 84 final layout checks.
- These checks found no remaining page-level horizontal overflow, out-of-viewport text/control boxes, broken loaded images or visible form/button controls shorter than the harness's 40px threshold. Intentional local table/carousel scrolling and decorative artwork were treated separately.
- 22 core interaction assertions and 30 extended interaction assertions passed. They cover menu opening/closing and landscape sizing, Escape and desktop resizing, FAQs, testimonial navigation and expanded review dialogs, referral values and settled prices at all five tiers, booking month/date navigation, weekends and unavailable slots, availability errors, back navigation, conflict recovery, pending-to-confirmed responses, booking reset, contact validation/error/success, report month selection and field labels.
- Manual interaction checks also confirmed that the terms continuation button stays disabled until the document is scrolled to the end and its checkbox is selected, that mobile navigation reaches the pricing page, and that a booking anchor stops below the fixed header. No terms form was submitted.
- Manual visual inspection focused on the homepage and gift offer, FCA offer and animated CTA, referral calculator, booking calendar, dashboard cards and monthly report inputs at narrow widths, plus the desktop homepage. The calendar's truncated month and referral result wrapping were found and fixed during this review.

The complete route/state inventory is in `MOBILE-QA-COVERAGE.json`. Paths under `/qa-states/` are test fixture aliases only; they are not routes added to the production website.

## Limits

This was desktop Chrome rendering at controlled iframe viewport dimensions, not physical iPhone/Android testing or a full mobile-device emulator. Safari/iOS and Chrome/Android devices were unavailable. Native on-screen keyboard behaviour, browser chrome collapsing, notches/safe-area rendering, native mobile date/select pickers, real touch dragging and device-specific performance remain to be verified on physical devices. Focus handling and short/landscape layouts were checked as partial proxies.

Reduced-motion handling was reviewed in the source; an actual OS-level reduced-motion session was not available. The layout checks do not prove that every animation frame or every possible customer-entered value is perfect. Live email delivery, Google integrations and real production credentials were deliberately not exercised. Account and report backend journeys were covered by isolated automated tests and rendered states; the read-only browser preview did not submit real account/report records.

No known failing regression remains in the checks above. A final physical-device acceptance pass is still appropriate before deployment.

## Running the supplied website

Use the existing project instructions and environment configuration. Dependencies are intentionally not included. Install from the lockfile with `npm ci`, rebuild with `npm run build`, and run `npm test`. The ZIP includes source, templates, public assets and the updated build manifest, but no credentials, customer database or `node_modules`.
