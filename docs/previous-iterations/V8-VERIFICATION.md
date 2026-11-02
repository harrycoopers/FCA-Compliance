# Verification report (22 Oct 2026)

## Real-browser checks
Run in headless Chromium through Playwright, against the app running locally. The Tailwind CDN and Google Analytics were blocked in the test environment.
- **All 8 commercial pages at 1440, 820 and 390px.** No horizontal page overflow and no off-screen text. Two overflows found on mobile were fixed: the date strip's hidden radio buttons, and the offer artwork's glow.
- **Navigation.**
  - The skip link focuses the main content.
  - Tab order runs logo → nav → Services menu.
  - ArrowDown opens the Services menu and Escape closes it.
  - The mobile menu opens, closes with Escape and returns focus.
- **Mobile meeting bar.** Hidden at the top of the page, shown after scrolling, and hidden again when the footer is visible.
- **Meeting request form.**
  - The date strip offers 10 weekdays from tomorrow.
  - Submitting empty shows field errors, and an invalid email shows an error.
  - With a Paris time zone, the time note reads “10:30 UK time is 11:30 where you are”.
  - With SMTP failing, the visitor sees an error and no “sent” state. With SMTP working, they see “Requested · awaiting confirmation” and focus moves to the confirmation.
- **Testimonial carousel.**
  - It rotates (one full cycle takes 60s) and pauses on hover.
  - The Previous and Next buttons and the arrow keys work.
  - Enter opens the full review, focus goes to Close, and Escape closes it and returns focus.
  - Announcements are made to screen readers.
  - With reduced motion it stays still and manual navigation still works.
- **Offer card.**
  - `offerSheen 7s ease-in-out` runs while the card is visible and pauses offscreen.
  - With reduced motion the animation stops and the sheen is hidden.
  - The price never moves.
  - The button is #2563EB and turns #1D4ED8 on hover.
- **Portal.** Register (precheck → terms → account) → dashboard → new monthly report submitted and stored in SQLite → reports list → log out → log in → wrong password rejected → password reset email sent (stubbed).

## Mocked or automated checks
- **Email** was stubbed throughout, using both success and failure modes. Meeting requests, enquiries and the password reset all went through the stub.
- **Server-side meeting validation** rejects missing times, invalid times, weekends, past dates and today, and accepts tomorrow. Requests sent without JavaScript redirect with an honest flash message.
- **Normal contact enquiries** behave exactly as before, including the missing-message validation.
- **Testimonials** were parsed from the rendered pages. All 16 on the homepage and 9 on the FCA page match the supplied wording exactly: attribution, excerpt, full paragraphs and highlights. The 5 quotes on other pages are verbatim extracts shown with their exact attributions.
- **Crawl of 32 internal pages** found no broken links, no £1,000 references, no “free consultation”, “no-obligation”, savings or cheapest claims, and no VAT or total figures. Every page includes the meeting CTA.
- **Structured data** is valid JSON on every page, and the FAQPage questions match the FAQs visible on each page.
- **Contrast**: body, muted and fine text are all at least 4.5:1, and white button text is 5.17:1 on #2563EB.
- **`BOOKING_URL`**: an https URL embeds the scheduler, and an unsafe value falls back to the request form.

## Not verified
- Real SMTP delivery and Google Sheets writes (no credentials here; that code is unchanged).
- Live-domain redirects on 009compliance.com, a real Calendly or other scheduler, and Safari, Firefox or real iOS/Android devices.
- How portal pages look with the Tailwind CDN loaded. It was blocked here, and those templates are unchanged.
- Designjoy, Consulting.com and Produce were inspected live. Superside wasn't, because the browser had no permission for that domain.
