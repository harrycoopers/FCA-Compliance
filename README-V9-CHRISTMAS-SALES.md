> Historical V9 notes: superseded by REFERRAL-UPDATE-V75.md for the current referral scheme.

# 009 Compliance — v9 Christmas sales redesign

The lead offer is FCA Authorisation Assistance at **£100 to get started (that's the first month), then £100 per month by Direct Debit**. There's a six-month minimum term, so the minimum service commitment is £600. Payments continue monthly until the customer cancels, and the FCA application fee is paid separately.
The main action on every page is **Book a 15-minute meeting**. It opens an in-page meeting-request form that goes through the existing `POST /contact` handler.

## Install (replace files)
1. Stop the server with Ctrl+C. Then **back up your whole project folder**, for example by copying it to `fca-compliance-portal-v8-backup`.
2. Unzip this archive and copy the contents of `fca-compliance-portal/` over your project, overwriting files when asked.
   `.env`, `db.sqlite` and `node_modules` are not in the ZIP, so your copies stay untouched.
3. No dependencies have changed. Run `npm install` only if `node_modules` is missing.
4. Run `npm start` (or `npm run dev`), then hard-refresh the browser with Ctrl+F5.
5. Read the start-up log. It lists every commercial term that is still unconfirmed.

New files: `config/campaign.js`, `config/referral.js`, `config/booking.js`, `data/competitors.js`, `views/referral.ejs`, `views/partials/{santa,meeting_form,meeting_section,payment_timeline,comparison,referral_ladder,referral_exclusions}.ejs`, `public/css/campaign.css`, `public/js/campaign.js`.
The v8 README and verification report have moved to `docs/previous-iterations/`.

## Rollback
Stop the server, restore the backup folder from step 1 (or re-extract the v8 ZIP), then restart.
The database schema and the `.env` keys are unchanged, so rolling back is safe. Nothing in this release writes new data.

## The settings you'll change
| What | Where |
|---|---|
| Prices, the minimum term, the £600 minimum, VAT, the cancellation notice and the historical £1,000 | `config/offer.js` |
| The campaign deadline (end of 25 Dec 2026, Europe/London) and what visitors see afterwards | `config/campaign.js` (`DEADLINE_ISO`, `postCampaign.mode`) |
| The booking link (Calendly etc.) | `config/booking.js` → `BOOKING_URL`, or `BOOKING_URL=` in `.env` (the `.env` value wins) |
| Referral tiers and the eligibility terms (published on /referral once set) | `config/referral.js` |
| Competitor prices and the date they were checked | `data/competitors.js` |

**After the deadline**, all festive styling, Santa, the campaign bar, the closing date, `validThrough` and the "Christmas offer" labels are removed on the server automatically.
Because `postCampaign.mode` is `'unconfirmed'`, price blocks are replaced by a neutral "talk to us about current pricing" panel, and no replacement price is invented.
- Set the mode to `'continue'` to keep showing £100/month without the Christmas branding.
- Set it to `'custom'` to show your own headline and text.

To preview the expired state locally, run `CAMPAIGN_NOW=2026-12-26T00:00:01Z npm start`.

## Pages
- **Homepage:** hero with the meeting CTA → featured offer (with a before-and-now explanation) → service cards → v7 testimonial carousel (16 reviews, embedded in `views/index.ejs`) → reasons to choose us → process → referral intro → FAQs → meeting request.
- **/fca-authorisation-motor-dealers:** hero with the offer card (Santa perched on it) → month-by-month payment timeline with the historical £1,000 in context → inclusions → steps → application testimonials → competitor comparison → referral promotion → FAQs → background reading → meeting request → Important note.
- **/pricing:** the offer and its terms → payment timeline → included / not included → the other services, with their existing wording and qualifications kept → referral note → FAQs → meeting request.
- **/referral (new):** the programme → accessible discount calculator (0–4, percentages and monthly amounts) → what the discount covers → every tier as a table → how it works → a placeholder for the programme terms → FAQs → meeting request (with the topic set to "Referral programme").

## Motion (all decorative layers are aria-hidden, don't take clicks, pause offscreen and are still under reduced motion)
- **Featured card:** produce.so/pricing was inspected live on 25 Oct 2026. Its card has a 165° navy gradient and a `proShimmer` sheen: 7s, skew −18°, moving for 55% of the cycle and then resting. There is also an 11s `sheenDrift`.
  Our original treatment is a gold-to-sky highlight that **travels around the card border** (a conic gradient taking 9s per lap) plus a softer 7s sheen behind the content.
- **Santa:** an original SVG character. He dances for four short beats (about 3.6s) when he first comes into view, then settles into a still pose.
- Snow falls only inside the snow-globe artwork, never over text. There are ribbon-and-bow corners on featured panels.
- A small car drives along the process "road" once.
- The countdown shows days only, is calculated from the fixed deadline and never resets.
