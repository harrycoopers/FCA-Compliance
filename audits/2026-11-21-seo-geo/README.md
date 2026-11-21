# SEO/GEO audit – 21 November 2026

Read in this order: `AUDIT.md` → `IMPLEMENTATION-PLAN.md` → `PAGE-INVENTORY.csv` → `INTERNAL-LINKS.csv`.

Evidence in `data/` (raw crawls, rendered mobile lab results, external-link checks, competitor captures,
claim extracts, screenshots). Reproduce from the repository root (read-only; GET requests only):

    node audits/2026-11-21-seo-geo/tools/crawl.cjs live
    node audits/2026-11-21-seo-geo/tools/crawl.cjs local
    node audits/2026-11-21-seo-geo/tools/render-perf.cjs
    node audits/2026-11-21-seo-geo/tools/external.cjs
    node audits/2026-11-21-seo-geo/tools/claims.cjs
    node audits/2026-11-21-seo-geo/tools/competitors.cjs <urls…>
    node audits/2026-11-21-seo-geo/tools/build-csv.cjs

Browser tools use `.qa/node_modules/playwright-core`. Clear `NODE_ENV` and `BASE_URL` in shells where they are
set to production values before running the local crawl. This folder sits outside `public/` and is not served.

`data/` is not versioned (gitignored: screenshots and raw crawls exceed 5 MB). Regenerate it with the tools above. Note: `data/crawl-local.json` is overwritten by each local crawl; `crawl-live.json` from 21 November 2026 is the pre-deployment live baseline.
