009 COMPLIANCE — REFERENCE TESTIMONIAL LAYOUT

INSTALLATION
Stop the server with Ctrl+C. Back up and replace these three files using
matching paths from the fca-compliance-portal folder in this ZIP:
  views/index.ejs
  public/css/home-sales.css
  public/js/testimonials.js
Keep your existing .env, database, node_modules and configuration unchanged.
Restart with npm run dev and refresh with Ctrl+F5. No dependencies were added.

CHANGES
Wider rounded cards inspired by the supplied image, with a prominent name and
separate role, business and location lines above the review. Existing white,
navy and light-blue gradients remain on a transparent section background.
No customer images or claims added. All punctuation is retained, including the
original unmatched parenthesis in Ian's supplied attribution.
Removed Stop animation, Animation stopped, Play/Pause controls and the visible
counter. Previous/Next and Read full review remain.
TESTIMONIAL_CYCLE_MS controls the 60000ms cycle. Hover/focus, open full reviews,
touch interaction, offscreen state and inactive tabs pause playback temporarily.
Manual navigation no longer sets a permanent stop. Reduced motion remains
stationary with manual navigation. Full review close returns focus to its
trigger; autoplay waits until focus and hover leave. Native details provide the
JavaScript-disabled fallback. Testimonials remain inline in index.ejs.

VERIFIED THIS UPDATE
- Actual EJS render in guest and signed-in contexts with no partial directory.
- All 16 testimonial data objects unchanged; displayed attribution segments
  concatenate to the exact original attribution, including punctuation.
- All homepage source outside the testimonial section remains byte-identical.
- Only the three files above changed; backend and other application files are
  unchanged.
- 84 isolated DOM/animation-clock assertions passed for the 60-second loop,
  hover/focus, temporary pauses, manual navigation, all full reviews and exact
  attributions, focus restoration, Escape, touch gestures, reduced motion,
  offscreen/background handling, fallback and taller card geometry.
- JavaScript syntax and CSS delimiter checks passed.

NOT VERIFIED
No real-browser or end-to-end checks were performed. Visual reference fidelity,
responsive clipping/overflow, real touch behaviour, native dialog focus trapping
and animation smoothness remain unverified. No screenshots are included.
Live forms, authentication, reporting, database, email and Sheets integrations
were not exercised; their code remains unchanged.

The complete source ZIP excludes secrets, databases, private runtime data and
installed dependencies. Use the three-file replacement to retain your setup.
