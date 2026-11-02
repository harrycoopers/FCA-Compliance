# 009 Compliance — Sales redesign (v8)

Lead offer: **FCA Authorisation Assistance — £100 to get started, then £100 per month, six-month minimum commitment.**
Primary action everywhere: **Book your 15-minute meeting** (→ `/contact#book-meeting`).

## Before you publish — unresolved terms

These are hidden from visitors until you fill them in `config/offer.js`. The server lists any that are still missing every time it starts.

1. **Minimum total**: is the first £100 one of the six monthly payments (£600 minimum) or paid on top of them (£700 minimum)?
2. **VAT**: are prices inclusive or exclusive of VAT, or is VAT not charged?
3. **After six months**: do payments continue until the customer cancels? What notice is needed?
4. **FCA decision timing**: what happens if the FCA decides before six months, or takes longer?
5. **Scope** (to confirm): the offer card and the pages list the same inclusions as the old £1,000 package. Please confirm nothing has changed.
6. **Separate services** (to confirm): ongoing compliance support and CCR009 assistance are shown as **not included** in the £100/month offer.
7. **£1,000 package**: every reference has been replaced by the new offer. Tell us if the one-off package should come back as an alternative.

When a term is confirmed, set it in `config/offer.js`, for example `minimumTotal: { amount: 600, explanation: 'The £100 start payment is the first of six monthly payments.' }`. The offer card, FAQs, pricing page and structured data all update from that one file.

## Booking

The code had no scheduling integration, so the site uses an **honestly labelled meeting request**:
- The visitor picks a weekday from tomorrow onwards and a UK time between 09:00 and 17:00 in 30-minute slots. Times are shown in UK time, converted to the visitor's own time zone where that differs. The visitor also chooses a topic and enters their details.
- The request goes through the existing `/contact` email handler, with the subject “15-minute meeting request … (NOT yet confirmed)”.
- The visitor only sees “Request sent — awaiting confirmation” once the email has actually sent. If it fails, they're told no meeting was requested and given the phone number and email address.
- Without JavaScript, a native date input and the same form still work, and the result shows as a flash message.

**To switch on real booking**, add a 15-minute event type in your scheduler (for example Calendly, Cal.com or Microsoft Bookings), then add this to `.env`:
```
BOOKING_URL=https://calendly.com/your-account/15min
```
Then restart the server. The contact page will embed the scheduler, and the scheduler confirms bookings itself. Only `https://` URLs are accepted.

## Install
1. Stop the server (Ctrl+C) and **back up your current project folder**.
2. Copy the contents of this ZIP over your project. Your `.env`, `db.sqlite` and `node_modules` aren't in the ZIP, so they stay untouched.
3. Delete these files if they're still present, because nothing uses them any more: `public/css/home-sales.css`, `public/css/theme-vibrant.css`, `public/js/design-motion.js`, `THEME-ROLLBACK/`.
4. No dependencies have changed. Run `npm install` only if `node_modules` is missing.
5. Run `npm run dev` (or `npm start`), then refresh the browser with Ctrl+F5.

## Rollback
Restore the backup from step 1, or re-extract `009-Compliance-V7-No-Service-Tags_2.zip`, then restart. The database schema hasn't changed, so rolling back is safe.

## What changed
| Area | Change |
|---|---|
| `views/layout.ejs` | New header with the meeting CTA, Client login, mobile menu and skip link. New footer. The company and legal text is the same, word for word. Self-hosted fonts. GSAP removed because nothing used it. |
| `views/index.ejs` | Standalone sales homepage: hero → testimonials → animated offer → inclusions → process → meeting → other services → FAQs → closing invitation → guides. |
| `views/fca_authorisation_motor_dealers.ejs` | Standalone landing page for adverts, with the offer card in the opening screen and application-related reviews. Long regulatory content is now in expandable sections, and the Important note is retained. |
| `views/pricing.ejs` | Lead offer, how payments work, included/not included, and other services marked as priced separately. The existing ongoing-support pricing conditions are retained. |
| `views/services.ejs`, `views/ccr009_return_assistance_motor_dealers.ejs`, `views/motor_dealer_compliance.ejs`, `views/about.ejs`, `views/contact.ejs` | Redesigned. Existing copy is kept and condensed, and detail sits in expandable sections. |
| `views/partials/*` | `offer_card`, `meeting_invite`, `faq_list`, `closer`. `hub_cta` (used by the guides) now offers the meeting. |
| `config/offer.js` | Single source for the commercial terms. |
| `data/testimonials.js` | All 16 testimonials, unchanged, moved out of `index.ejs` into a data module (not a partial). |
| `data/faqs.js` | Buying FAQs. Visible FAQs and FAQPage schema come from the same source. |
| `server.js` | Meeting-request fields on `POST /contact` (normal enquiries behave as before). Optional `BOOKING_URL`. New page metadata and offer schema. No other changes to routes, auth, reports, Sheets or the database. |
| `public/css/site.css`, `public/js/site.js` | New design system and behaviour, replacing `home-sales.css`, `theme-vibrant.css` and `design-motion.js`. `styles.css` and `redesign.css` stay for the guides and portal. |
| `public/js/testimonials.js` | Now works on any page with `[data-testimonials]`. Carousel logic and the 60-second cycle are unchanged. |

## Produce pricing-card effect (observed 22 Oct 2026)
These details were read live from produce.so/pricing and reproduced exactly:
- 165° navy gradient (#0B1220 → #0F1B33 → #12243F), 24–28px radius.
- Inset top highlight, a blue inner glow and a deep drop shadow.
- A skewed white sheen (−18°, 45% wide) that sweeps across every 7s with ease-in-out. It moves for 55% of the cycle, then rests.
- The CTA has a slow 6s sheen, and on hover it lifts with `scale(1.02) translateY(-1px)` and a quick sweep.

Adapted for 009 Compliance:
- The button is solid #2563EB, turning #1D4ED8 on hover.
- The sheen runs behind the content, so text and prices never move.
- Animation pauses when the card is offscreen or the tab is hidden, and is switched off for reduced motion.
- Produce's 14 particle dots are left out. They sat almost motionless in one corner and added nothing.
