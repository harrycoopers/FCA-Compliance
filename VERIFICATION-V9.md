> Historical V9 notes: superseded by REFERRAL-UPDATE-V75.md for the current referral scheme.

# Verification report — v9 (25 October 2026)

Tested against the app running locally (Node 22, a separate test SQLite database), in headless Chromium through Playwright.
The Tailwind CDN and Google Analytics were blocked in the test environment.

## Real-browser tests (all passed)
- **Layout:** 13 pages at 390, 820, 1180 and 1440px. No horizontal page overflow and no off-screen elements. Header labels no longer wrap at 1180px.
- **Referral calculator, keyboard:**
  - The range input takes focus and shows a visible outline.
  - The arrow keys go from 1 to 4 (100%), and the value is capped at 4. Home goes to 0%.
  - `aria-valuetext` updates. The polite live summary is announced once, about 700ms after the last change.
- **Referral calculator, other states:**
  - Touch (Pixel 5 emulation): tapping at three-quarters of the track gives 3 referrals (75%). The touch target is 44px tall.
  - Without JavaScript: the "Show discount" button appears and the form submits a GET request. `?referrals=2` shows 50%. Out-of-range values are clamped (99 → 100%, −3 → 0%). All 5 tiers are readable in a table.
  - The current calculator displays £100, £75, £50, £25 and £0 for 0–4 active qualifying referrals.
- **Meeting request (homepage and FCA page, through `POST /contact`, email stubbed):**
  - Submitting an empty form shows errors, and an invalid email is rejected.
  - On success the visitor sees "Requested · awaiting confirmation" and "isn’t a confirmed appointment".
  - When SMTP fails, the visitor sees an honest error and no success state.
  - Without JavaScript, a submission redirects to `/contact#book-meeting` with a flash message.
  - Normal enquiries, and the validation for a missing message, behave as before.
  - /referral preselects the topic "Referral programme".
- **Carousel:**
  - It rotates, pauses on hover, and the Next control moves it.
  - The full review opens in a dialog, focus goes to Close, and Escape closes it and restores focus.
  - Without JavaScript all 16 cards are shown.
  - The 16 reviews embedded in `index.ejs` are byte-identical to v8's `data/testimonials.js`, which is unchanged.
- **Motion:**
  - Santa dances when he comes into view, then settles.
  - With reduced motion, Santa doesn't dance and the orbit and sheen are switched off.
  - Decorative layers have `pointer-events:none`.
- **Buttons:** all 9 primary buttons are #2563EB and turn #1D4ED8 on hover.
- **Portal:** register (precheck → terms → account) → dashboard → new report stored in SQLite (1 row) → reports list → log out → wrong password rejected → log in. No page errors, and no campaign bar on portal pages.

## Server and static checks
- **Campaign expiry:** checked with `CAMPAIGN_NOW` set to 23:59:59 on 25 Dec (active) and 00:00:01 on 26 Dec (expired).
  After expiry there's no Christmas branding, Santa, campaign bar, closing date, `validThrough` or £1,000 on any page. The £100/month subscription price and its FAQs are hidden. Continuing reporting uses the base monthly fee less active qualifying referral discounts.
- **Crawl:** 40 internal links all return 200.
- **Claims:** no banned claims on the 9 sales pages (90%, cheapest, lowest price, free consultation, free forever, £400 saving, "reduced to £100", guaranteed approval, "meeting confirmed", £600 as a total).
- **Markup:** all JSON-LD parses, FAQPage questions match the FAQs visible on each page, and there are no duplicate IDs.
- **Contrast:** all new colour pairs are at least 4.5:1. The lowest are calendar ticks and gift labels at 5.03:1, and white on blue buttons at 5.17:1.
- **Competitor prices:** rechecked live on 25 Oct 2026. CreditLicence £995 (paid in two parts of £495 and £500, no VAT added). Carlive £1,299 or £1,499 (VAT not stated). Cardealer Consumer Credit £1,500 + VAT (50% up front). The FCA fee is separate for all three.

## Not verified
- Real SMTP delivery and Google Sheets writes. That code is unchanged, and email was stubbed.
- Safari, Firefox and real iOS or Android devices, and screen readers other than through the ARIA attributes.
- How the portal looks with the Tailwind CDN loaded.
- A real booking scheduler, because `BOOKING_URL` is empty.
