009 Compliance — guide-only content and SEO improvements, 12 November 2026

Open review.html for the full page-by-page report, exact metadata, before/after
excerpts, official-source evidence, search research, tests and local previews.
This report supersedes the earlier content-preservation-only reports for the
newly authorised guide-content task. Earlier reports are historical records.

The baseline here is the uncommitted working tree at the start of this task,
including the previous SEO work. It is not the Git HEAD version.

Reproduce local checks from the repository root:
  npm.cmd run build
  npm.cmd test
  node scripts/guide-seo-preview.cjs

Leave that isolated preview running on http://127.0.0.1:3099, then run:
  node scripts/guide-improvements-check.cjs
  node scripts/guide-improvements-pricing.cjs
  node scripts/guide-improvements-performance.cjs

Run the performance script alone, after the other browser checks finish.
It compares the saved starting HTML and matching fingerprinted assets with
the current local render, under the conditions recorded in its result file.
It is a lab simulation, not field Core Web Vitals or a Lighthouse score.

Browser scripts use the existing .qa/node_modules/playwright-core package
and installed Chromium; PLAYWRIGHT_MODULE can override the package location.
They block external browser traffic and do not submit real bookings.

Key evidence:
  content-evidence.json         54 exact changed-field records and sources
  research.json                 Queries, sources, observations and limitations
  search-console-assessment.json  Supplied export assessment
  internal-link-map.json         Final guide-to-guide/service link inventory
  browser-results.json           Final all-route browser checks
  pricing-browser-results.json   56 campaign-state browser cases
  performance-results.json       30 repeated lab runs and summary statistics
  source-before-hashes.json      Starting scope-preservation snapshot
  content-before.json            Starting guide content
  rendered-before.json.gz        Starting HTML
  rendered-after.json.gz         Final public-route HTML

Unresolved FCA threshold/source conflict and out-of-scope pricing, timing
and analytics issues are documented in review.html. Nothing was deployed,
committed, pushed or submitted for indexing.
