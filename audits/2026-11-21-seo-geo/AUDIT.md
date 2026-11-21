# 009 Compliance: SEO and GEO audit

**Date:** 21 November 2026
**Scope:** https://009compliance.com (live) and the repository at commit `cde423d`, branch `seo-geo-release-2026-11` (local build).
**Status of the site:** unchanged. This audit made no edits to the site. Everything is in `audits/2026-11-21-seo-geo/`, which is outside `public/`. Express serves only `public/`, and a request for `/audits/...` returns 404.

Environment labels used throughout:
- **live**: what https://009compliance.com serves today.
- **local build**: the committed branch, rendered in-process by the real Express app.
- **both**: identical in both.

The live site runs an earlier deployment than the committed branch. Many findings are "fixed locally, not live".

---

## The five highest-value actions

| # | Action | Why it matters (evidence) | Environment |
|---|---|---|---|
| 1 | **Deploy the committed release, then resubmit the sitemap and IndexNow.** | **Live 404s:** `/guides`, `/llms.txt`, the IndexNow key file and all six new guides return **404**. Those guides target the commercial queries where the site ranks poorly today: "fca limited permission application" (position 20.9), "fca credit broking permission" (42), "car dealer fca approval" (25), "consumer credit licence uk cost" (25.5). **Unclicked rankings:** the click-through fixes for the two highest-impression guides are local only. /do-motor-dealers-need-fca-authorisation had 234 impressions at position 7.1 with 2 clicks. /fca-licence-car-dealers had 232 impressions at position 4.9 with **0 clicks** (28-day export, 14 October to 10 November 2026). **Schema:** live Organization schema has no `description`, `areaServed` or `sameAs`; the local build adds them. | live (fixed in local build) |
| 2 | **Put "our fees and the FCA's fees" side by side on the offer page, /pricing and the homepage FAQ.** | **Offer page:** /fca-authorisation-motor-dealers is the highest-intent page (259 impressions, position 10.2, 3 clicks). It never states what the FCA charges, only that its fee "is paid separately". **Competitor:** CreditLicence's ranking page states the FCA £560 application fee and the £1,100 minimum annual fee beside its own £1,195. **Homepage FAQ:** the cost answer is "Fees depend on the service and agreed scope", which an answer engine cannot quote as a price. | both |
| 3 | **Capture the source of every enquiry (landing page, referrer category, topic), first-party and server-side.** | **Bookings:** store the topic but no landing page or referrer (`booking/service.js`, `meeting_bookings` table). **Contact form and phone:** the form stores no source and calls are not tracked. **Analytics:** deliberately disabled (`public/js/analytics-disabled.js`). Nothing currently shows which guide, search or AI assistant produced an enquiry, so no SEO or GEO change can be judged on enquiries. | both |
| 4 | **Rewrite the first two sentences of five guides as direct, self-contained answers.** | **CCR009:** "ccr009" has 38 impressions at position 15.2. /who-needs-to-submit-ccr009 opens with "Start with the firm's permissions.", but the FCA states the answer in one sentence (§5.3). **Delays:** /why-fca-applications-get-delayed gives no figure, though the FCA publishes a 95% four-month/ten-month target and a Q1 2026/27 median of 131 days. **Hedged openings:** several openings lead with caveats ("That is a starting point, not a rule"). These hurt both snippet selection and AI quotation. | both |
| 5 | **Act on the 24 rows in INTERNAL-LINKS.csv, starting with the 8 P1 additions.** (21 additions, 1 repair, and 2 links already in the release.) | **New guides are weakly linked.** Contextual inlinks: van and commercial vehicle guide 2, CCR007 guide 3, cost guide 4, refusal guide 4, PCP/HP guide 5. Neither /pricing nor the offer page links the cost guide. The motor-finance service page doesn't link the PCP/HP guide. **Other gaps:** /about has 0 contextual inlinks. A vague "Learn More ↗" anchor repeats on every FCA guide (`views/partials/referral_animation.ejs`). | local build |

---

> **Correction (added 21 November 2026, after the P1 fixes).** The first crawl counted URL variants (`/guides/`, the trailing-slash and upper-case guide URLs) as separate linking pages. That overstated "contextual inlinks" by 1–3 for several pages. Corrected pre-fix baselines, counting canonical pages only: cost guide 3, CCR007 guide 2, PCP/HP guide 2, how-to-apply guide 8, van guide 1. The crawler is fixed (`tools/crawl.cjs`). `data/crawl-local.json` now holds the post-fix local crawl. The I-4 targets in IMPLEMENTATION-PLAN.md were set from the inflated counts.

## 1. Inventory and coverage

### 1.1 How URLs were discovered

Sources, reconciled in `data/crawl-live.json` and `data/crawl-local.json`:

1. **Route definitions** in `server.js`: literal `app.get`, the slug arrays and the new-guide route list.
2. **Registries:** `config/seo-pages.json` and `config/guide-content.json`.
3. **Discovery files:** live and local `/sitemap.xml`, `/robots.txt` and `/llms.txt`.
4. **Search Console Pages export:** `docs/guide-release-review/search-console-Pages.csv`.
5. **Homepage crawl:** a breadth-first crawl from `/` through ordinary `<a href>` links in the raw HTML, covering header, mega-menu, footer and body.
6. **Utility and portal routes:** fetched without signing in.
7. **Variants:** trailing slash, uppercase, `?utm_` parameters, `/index.html`, a nonexistent URL, and http/www hostnames.

### 1.2 Totals

| Measure | Count | Notes |
|---|---|---|
| Unique URLs discovered | **65** | Same set in both environments |
| Fetched | **65 live + 65 local + 5 hostname variants** | GET only |
| Public content pages | **40 local / 33 live** | The 7 local-only pages are `/guides` and the six new guides, all 404 live |
| Content pages read in full | **40** | All 24 guides read in full, including tables and FAQs |
| Redirecting URLs | **11** | Trailing slash, uppercase, `/guides/` (local), 4 hostname/protocol variants, and 4 portal routes that 302 to login |
| Excluded by purpose | **25** | 11 utility/private routes, 4 discovery files, 10 parameter/variant URLs |
| Public PDFs | **0** | None served from our domain |
| Left unverified | Indexing state of every URL, field Core Web Vitals, UK rankings, AI answers, backlinks | See §9 |

**Reconciliation:**
- The homepage crawl reaches **every** public content page at **click depth 1** in both environments, through the header mega-menu and footer.
- The crawl alone would miss `/logout`, `/dashboard`, `/reports`, `/reports/new`, `/verify-email-notice`, `/reset-password`, `/unsubscribe`, `/api/metrics`, `/llms.txt`, the IndexNow key file and all variants. These came from the route definitions and the utility list.
- The live sitemap (33) matches the live content set exactly. The local sitemap (40) adds `/guides` and the six new guides.
- No sitemap URL redirects or returns an error in either environment.

`PAGE-INVENTORY.csv` has one row per URL (65). Each of the 40 content pages has a purpose, reader, intent, query cluster, status, signals, depth, inlinks, issue and action.

---

## 2. Technical SEO and indexability

### 2.1 What is working (keep)

| Check | Result | Environment |
|---|---|---|
| HTTPS and hostname | `http://` and `www` 301 to `https://009compliance.com`. Query strings are preserved (`?ref=abc`). | live |
| Trailing slash and case | `/do-motor-dealers-need-fca-authorisation/` and the upper-case variant 301 to the canonical URL | both |
| Canonicals | All 40 content pages self-canonicalise. `?utm_` and `/contact?topic=` variants canonicalise to the clean URL. | both |
| Robots | `robots.txt` allows all and lists the sitemap. Content pages are `index,follow,max-image-preview:large`. Portal pages are `noindex,follow` in both the meta tag and the `X-Robots-Tag` header. No development `noindex` leaks into production. | both |
| 404 handling | Unknown URLs return a true 404 with `noindex`. No soft 404s were found. | both |
| Raw HTML vs rendered | Title, canonical, H1, body copy, breadcrumbs, JSON-LD and links are in the initial HTML. Rendered link counts match raw within 0–6. On /do-motor-dealers-need-fca-authorisation, all 6 extra raw links sit inside inert `<template>` elements (the post-campaign fallback offer copies), so no visible content link is lost. Guide FAQs use native `<details>`, so the text is in the HTML. The mobile menu is a `<details>` element whose links are in the HTML. | live (15 URLs rendered) |
| Mobile | No horizontal overflow at 390px on 15 representative pages. Viewport meta present. | live |
| Performance (lab) | Throttled mobile (4× CPU, 1.6 Mbps, 150 ms RTT, Chromium): **LCP 1.2–2.1 s, CLS ≤ 0.001, TTFB 69–168 ms.** No third-party requests and no cookie banner. Largest asset class is web fonts (60–82 KB). | live (lab only) |
| Images | No `<img>` without `alt` on any content page | both |

### 2.2 Issues

**T1. Live is behind the committed build (high).**
- **Affected URLs:**
  - Six new guides: `/fca-authorisation-cost-car-dealers`, `/how-to-apply-fca-limited-permission-car-dealers`, `/fca-application-refused-motor-dealers`, `/how-to-offer-car-finance-dealers`, `/what-is-ccr007`, `/van-commercial-vehicle-dealers-fca-permissions`
  - `/guides`, `/llms.txt`, `/36341005a716865fb5c566c8d7418ce1.txt` (IndexNow key)
  - Changed metadata, copy or schema on /, /about, /motor-dealer-compliance, /fca-authorisation-motor-dealers and 14 guides
- **Evidence:** live 404 versus local 200 (PAGE-INVENTORY.csv, `live_status` and `local_status` columns). The live Organization JSON-LD has `name`, `legalName`, `url`, `logo`, `email`, `telephone` and `address`, but no `description`, `areaServed`, `foundingDate` or `sameAs`.
- **Impact:** every improvement from the last release is invisible to search engines and answer engines. IndexNow submissions would fail key verification.
- **Fix:** deploy. Then submit `/sitemap.xml` in Google Search Console and Bing Webmaster Tools, and run `node scripts/indexnow.cjs` with the changed paths (`README.md`).
- **Verify:** rerun `node audits/2026-11-21-seo-geo/tools/crawl.cjs live`. Expect 40 indexable content pages and a 40-URL sitemap. Check `/36341005a716865fb5c566c8d7418ce1.txt` returns 200.

**T2. `/register` appeared in search despite `noindex` (low, self-resolving).** 38 impressions at position 5.5 in the 28-day export. It's `noindex,follow` in both environments, so it should drop out on recrawl.
- **Verify:** URL Inspection on `/register` shows "Excluded by 'noindex'".

**T3. `/api/metrics` is public and unused (not SEO; privacy and housekeeping).** It returns `{"count":35}`, the number of client accounts (`server.js:350`). Its only caller, `public/js/main.js:7`, looks for an `#user-count` element that no template renders.
- **Fix:** remove the route and the dead counter code.

**T4. Minor, keep under review:**
- **Redirect chain:** `http://www` → `https://www` → apex is a two-hop chain. It comes from Cloudflare/Render, not the app. Optional: a single redirect rule at Cloudflare.
- **Session cookie:** a session cookie (`009.sid`) is set on every anonymous public page, and pages are served `private, no-cache`. That's harmless for SEO and TTFB is fast, but it prevents edge caching. Only consider changing this if server load matters.
- **Logout:** `GET /logout` renders a 200 page with `noindex`. A POST-only logout is the better practice.

**T5. Structured data (both, after deployment).**
- **Valid types:** Article, BreadcrumbList, FAQPage, WebPage, Service, Organization, CollectionPage and ItemList all parse and match visible content. The release gate checks FAQ parity on 24 guides.
- **FAQPage:** Google's changelog says FAQ rich results are no longer shown, as of 7 May 2026 (see §5.1). The FAQPage markup is harmless and matches the visible FAQs, but expect no rich-result benefit. Don't spend effort on it.
- **Article author:** the Organization. That's correct, given you've chosen not to publish individual profiles.

---

## 3. Content assessment

Every content page has its purpose, reader, intent, query cluster (labelled **observed** or **inferred**) and action in PAGE-INVENTORY.csv.

**Query labels:**
- **Observed** queries come from the saved 28-day Search Console export, or from the 16-month figures you supplied in the earlier brief.
- **Page-level query pairs** are not available: the export has no page and query dimension together.

### 3.1 FCA-claim verification (sources checked 21 November 2026)

| Claim (page) | Primary source | Result |
|---|---|---|
| Limited-permission application fee £560, Category 2; non-refundable; paid in Connect (cost guide) | [FCA application fees](https://www.fca.org.uk/firms/authorisation/apply/fees), updated 19/11/2026; FEES 3.2.6G | **Verified.** One conflict: the [FCA "how to apply" page](https://www.fca.org.uk/firms/authorisation/apply) (Rejections) still says rejected submissions get a refund. The guides now point readers to the fees page, so they're correct whichever FCA page is fixed. |
| CC.1 minimum fee £1,100 for 2026/27 across all income bands (cost guide) | [FCA fee movements](https://www.fca.org.uk/firms/fees-and-levies/fee-movements), updated 02/07/2026 (the cell spans 3 rows) | Verified |
| 5% proxy for broking income with no commission (cost guide) | [FCA consumer credit income help](https://www.fca.org.uk/firms/fees/consumer-credit-income-help) | Verified |
| CCR007 30 business days; CCR009 40 business days | [SUP 16.12](https://handbook.fca.org.uk/handbook/sup16/sup16s41) as of 21/11/2026 | Verified |
| CCR007 and CCR009 on a calendar-year basis from 2026 | [FCA consumer credit reporting](https://www.fca.org.uk/firms/regulatory-reporting/consumer-credit-reporting) | Verified |
| CCR009 replaced CCR004 and CCR005 and parts of CCR002/CCR007, from 7 May 2025 (what-is-ccr009) | [FCA CCR009 page](https://www.fca.org.uk/firms/consumer-credit-reporting/ccr009) | Verified |
| £5m boundary inconsistency (when-is-ccr009-due) | FCA CCR009 page says "£5m or more"; SUP 16.12 Note 12 says "more than £5 million" | **Still inconsistent at FCA.** The guide correctly flags it. |
| 95% within 4/10 months target for new Part 4A applications (why-delayed) | FCA *Authorisations operating service metrics Q1 2026/27*, row A1.1 | Verified. The same table gives Q1 lower-quartile/median/upper-quartile determination times of **91/131/190 days**, which aren't used on the site yet. |
| "Earlier of six months … or twelve months" (why-delayed) | FCA *full consumer credit firm notes* PDF, p.2 | Verified as the FCA's own wording, though the cited notes are for *full* permission. Recommendation: cite [FSMA s.55V](https://www.legislation.gov.uk/ukpga/2000/8/section/55V) alongside it, since the statute applies to limited permission too. |
| CONC 4.5.4R amount on request; CONC 4.5.6R discretionary commission ban from 28/01/2021 (PCP/HP guide) | [CONC 4.5](https://handbook.fca.org.uk/handbook/conc4/conc4s5) | Verified |
| PERG 2.7.19C: business exemption ≤£25,000 only for green deal plans (van guide) | [PERG 2.7](https://handbook.fca.org.uk/handbook/perg2/perg2s7) | Verified |
| All 49 external reference links | `data/external-links.json` | **All return 200.** Every Handbook link's rendered section title matches its label: COND 2.3/2.4, SUP 16 Annex 38C/38D, CONC 3.5/3.7/4.5, PERG 2.7, PRIN 2A, PRIN 2A.8, SUP 12.2. |

**Regulatory requirement vs our service.** The guides keep the two apart consistently ("administrative assistance, not legal or regulatory advice"; "The FCA makes authorisation decisions"). No guide implies 009 Compliance can influence an FCA decision. Keep this.

### 3.2 Openings that weaken snippets and AI answers (exact examples)

| Page | Existing opening (first sentence or clause) | Problem |
|---|---|---|
| /who-needs-to-submit-ccr009 | "Start with the firm's permissions." | An instruction, not an answer. It can't be quoted on its own. |
| /limited-permission-fca-authorisation-motor-dealers | "A motor dealer selling its own vehicles … may qualify for limited-permission secondary credit broking. That is a starting point, not a rule for every dealer." | The hedge is louder than the answer, and the full-permission condition is missing. |
| /common-ccr009-reporting-mistakes | "…These are errors to check for, not a claim about which mistakes occur most often." | A meta-disclaimer in sentence two. |
| /why-fca-applications-get-delayed | "Separate preparation time, formal assessment periods and the FCA's operating targets. None is an average approval time…" | Names the measures but gives none of the numbers. |
| /what-is-ccr009 | "CCR009 is a regulatory return … not a licence or a tax return." | Doesn't say who files it, how often or by when. |
| /fca-application-documents-motor-dealers | "A motor-dealer FCA application needs information about the firm, its ownership, proposed regulated activities and how it will operate." | Generic. The FCA names the components (application form, business plan, forecasts, forms). |

Rewrites are in §5.3. No contradictory answers were found between guides. The CCR007 period, deadline and CCR009 concession statements agree across `/ccr009-vs-ccr007`, `/when-is-ccr009-due`, `/what-is-ccr009` and `/what-is-ccr007`.

### 3.3 Near-duplicates and overlap

Text overlap is low. The highest five-word-phrase overlap is **5.3%** (/ccr009-vs-ccr007 vs /what-is-ccr007), and no sentence repeats across guides. The risk is *intent* overlap, not copied text.

| Pages | Same reader? | Verdict |
|---|---|---|
| /what-is-ccr007 vs /ccr009-vs-ccr007 | Different questions: definition vs comparison | **Keep both.** Make /what-is-ccr007 the target for "ccr007" by linking to it with that anchor from CCR009 pages (INTERNAL-LINKS.csv). |
| /what-information-is-needed-for-ccr009 vs /ccr009-reporting-checklist-motor-dealers vs /how-to-prepare-for-ccr009-return | Different stages: data, final check, workflow | **Keep.** Sibling links are in the local build. |
| /fca-application-documents-motor-dealers vs /how-to-apply-fca-limited-permission-car-dealers | Documents vs process | **Keep.** They cross-link both ways (local). |
| /do-motor-dealers-need-fca-authorisation vs /fca-licence-car-dealers vs /credit-broking-permission-motor-dealers | Overlap on "do I need it / which permission" | **Keep.** Distinct entry wording (need / licence / credit broking), and the local openings now differ. Watch for both appearing for the same query once page-level data exists (§7). |
| /guides vs /fca-compliance-motor-dealers-guide | **Yes, both act as hubs once /guides is live.** | **Keep for now.** Live, the overview has 20 contextual inlinks; locally it has 7. After 90 days of data, merge the overview into /guides **if** it gets no non-brand impressions. If merged, keep its "responsibility calendar" and "choose support" sections in /guides, 301 `/fca-compliance-motor-dealers-guide` → `/guides`, and update the hub links in `config/guide-links.json` and the layout breadcrumbs. |
| /, /services, /motor-dealer-compliance | Different roles: brand, comparison, ongoing service | **Keep.** Sibling lines are in place (local). |

### 3.4 Gaps: improve existing pages before adding new ones

These are the dealer questions that showed up and aren't answered well.

- **"How long does FCA authorisation take?"** Improve /why-fca-applications-get-delayed with the target and median (§5.3). Don't create a new page.
- **"Our fees vs FCA fees."** Add to the offer page and /pricing (action 2). Don't create a new page.
- **Training-quiz queries:**
  - **Examples:** "…are classed as what by the fca?" (17 impressions, position 2.65) and "a motor dealer must be:" (5 impressions).
  - **Pattern:** they look like exam questions with low buying intent.
  - **Action:** none. The existing guides already answer them.

---

## 4. Links and structure

### 4.1 Map summary (local build)

| Signal | Value | Comment |
|---|---|---|
| Click depth | **1 for all 40 content pages** | The mega-menu and footer list every page. Depth isn't a problem. |
| Links by region (40 pages) | header 3,080 · footer 920 · main 951 · aside 218 | Menus dominate. Contextual links are what show relevance. |
| Weakest contextual inlinks | /about **0**, /privacy, /complaints, /cookie **0**, /terms 1, /van-commercial… **2**, /what-is-ccr007 **3**, /fca-authorisation-cost… **4**, /fca-application-refused… **4**, /motor-finance-for-dealerships 4, /testimonials 4, /how-to-offer-car-finance… **5** | Policy pages at 0 is fine. The rest need links. |
| Strongest | /contact 37, / 37, /pricing 29, /fca-authorisation-motor-dealers 28, /guides 26 | |
| Broken internal links or fragments | **0** of 48 unique targets | Release gate check |
| Vague anchors | "Learn More ↗" → /referral on 12+ pages | One partial fix |
| Orphans | **0** | |

### 4.2 Journeys and where they break

1. **"Do I need FCA authorisation?" → offer → enquiry.**
   - **Path:** /do-motor-dealers-need-fca-authorisation → compact offer banner (local) → /fca-authorisation-motor-dealers → book a call.
   - **Break point:** on the offer page, the dealer asking "what will this cost me in total?" finds 009's terms but not the FCA's £560 fee or the annual fee.
   - **Fix:** action 2, linking the cost guide.
2. **"I've got a CCR009 task" → assistance → enquiry.**
   - **Path:** /what-is-ccr009 or the "ccr009" query → CCR009 call-to-action panel → /ccr009-return-assistance-motor-dealers.
   - **Break point:** the service page assumes CCR009 applies. A limited-permission dealer also has CCR007 (the service covers both), but the page doesn't explain CCR007 or link /what-is-ccr007.
   - **Fix:** a three-row "Does CCR009 apply?" block plus links (INTERNAL-LINKS.csv).
3. **"How do I offer PCP finance?" → permission → finance support.**
   - **Path:** /how-to-offer-car-finance-dealers (local) ↔ /motor-finance-for-dealerships.
   - **Break point:** there's no link between them in either direction, so a dealer on the service page can't reach the rules, and vice versa.
4. **Van dealer.**
   - **Path:** the offer page names "van and commercial vehicle dealers" but doesn't link the van guide. The van guide is reachable only from the hub and menus.

All recommended links are in **INTERNAL-LINKS.csv**, with source, destination, anchor, exact placement, action, priority and reason.

---

## 5. GEO and AI-search visibility

### 5.1 Platform facts (official documentation, read 21 November 2026)

| Platform | What controls visibility | Source |
|---|---|---|
| Google AI Overviews / AI Mode | "There are no additional requirements … nor other special optimizations." Pages must be indexed and eligible for a snippet. No special files or schema are needed. `nosnippet`, `max-snippet` and `data-nosnippet` apply to AI features. Google-Extended "does not impact a site's inclusion in Google Search". | developers.google.com: *AI features and your website*; *Google common crawlers*; *Robots meta tag* |
| Google FAQ rich results | Changelog: "will no longer appear in Google Search starting May 7, 2026"; 15 June 2026: "no longer shown" | Google Search Central changelog |
| llms.txt | Google changelog (15 June 2026): llms.txt files "aren't needed for Google Search (and won't negatively or positively impact your visibility or rankings)". No official OpenAI, Perplexity or Anthropic crawler documentation adopts it. | Google changelog; llmstxt.org (a proposal) |
| ChatGPT search | **OAI-SearchBot** governs appearance in ChatGPT search. GPTBot is training only. ChatGPT-User is user-triggered and "not used to determine whether content may appear in Search". | developers.openai.com/api/docs/bots |
| Perplexity | **PerplexityBot** surfaces sites in results (not training). Perplexity-User fetches on request and "generally ignores robots.txt". | docs.perplexity.ai/guides/bots |
| Claude | ClaudeBot (training), Claude-User (user-directed), Claude-SearchBot (search indexing). All honour robots.txt. | support.claude.com, article 8896518 |
| Bing / Copilot | **Not read.** The Bing Webmaster Guidelines page returned only its title. Treat Copilot-specific claims as unverified. IndexNow notifies participating engines (indexnow.org). | Limitation |

**What this means for 009 Compliance:**
- **Crawler access:** `robots.txt` blocks no crawler, and no snippet restrictions are used. A spoofed-user-agent test returned **200** for Googlebot, bingbot, OAI-SearchBot, GPTBot, ChatGPT-User, PerplexityBot, ClaudeBot and Claude-SearchBot. That's indicative only: genuine crawler IPs and Cloudflare bot rules can't be verified from outside, so **genuine access is unverified**.
- **No special tactics needed:** llms.txt, FAQ schema and "AI markup" earn **no priority**. Keep llms.txt because it costs nothing, but don't invest in it.
- **Practical priorities:** being indexed, quotable openings, consistent entity facts and the internal links above.

### 5.2 Can an answer engine describe 009 Compliance accurately?

| Fact | Visible copy | Metadata / schema | Consistent? |
|---|---|---|---|
| Who we help | "car, motorcycle, van and commercial vehicle dealers" (offer page, home); "motor dealers of every size across England, Scotland, Wales and Northern Ireland" (About, local) | Organization `description` "UK motor dealers" (local only) | Yes after deployment |
| What we provide | FCA authorisation assistance, CCR009/CCR007 reporting assistance, ongoing compliance, motor-finance broker support | Service schema on 4 service pages | Yes |
| Where | Oldham address in schema and footer; nationwide coverage on About (local) | `address` Oldham; `areaServed` GB (local only) | Yes after deployment. Matches Companies House (registered office C/O Hilton Jones, Hollinwood Business Centre, Albert Street, Oldham OL8 3QL; incorporated 15 December 2025; SIC 70229). |
| Cost | Offer page and /pricing: £100 to start, £100/month, six-month minimum (£600), FCA fee separate. **Homepage FAQ:** "Fees depend on the service and agreed scope." | Offer-page meta description includes the price | **Partly.** The homepage FAQ, which is also FAQPage schema, gives no figure. |
| Who decides | "The FCA decides applications and timescales, and approval isn't guaranteed" (offer page, guides) | – | Yes |
| People | Reviews name **"Jon"** 8 times; one review spells it **"John"**. The site never says who Jon is. | No Person schema (deliberate) | **Ambiguous for entity resolution** (see recommendation E1) |
| Experience | "Our team brings 30+ years in the motor trade" (About, local); "30+ years of motor-finance experience" (home service card, /services, /motor-finance-for-dealerships) | About title "30+ Years of Motor Trade Experience" (live) | **Two phrasings.** Pick one. |
| External profiles | Companies House (in `sameAs`, local). No LinkedIn or Google Business Profile configured (`config/site-identity.json`). | | Thin |

**E1.** Without adding career histories, which you've decided against, consider one factual line on About naming the person clients refer to, with their role only. For example: "Clients will usually deal with Jon [surname], [role]." That's your call. If you'd rather not, the reviews can stay as they are; answer engines will simply treat "Jon" as unlinked.

**E2.** Use one experience statement everywhere: "Our team brings 30+ years in the motor trade". Change "motor-finance experience" on the three pages that use it, or confirm both are true and say both.

### 5.3 Ambiguous passages and better versions

These rewrites keep the conditions and the attribution. Each is answer-first and stands alone if quoted.

**/who-needs-to-submit-ccr009**
- *Existing:* "Start with the firm's permissions. CCR009 applies to relevant ancillary credit firms with credit broking, debt adjusting, debt counselling or credit information services permissions, subject to the applicable reporting rules."
- *Better:* "The FCA says any firm with permission for credit broking, debt adjusting, debt counselling or providing credit information services must submit CCR009. That includes limited-permission motor dealers, who also submit a reduced CCR007. An appointed representative's activity is normally reported by its principal; check your firm's schedule in RegData."
- *Source:* [FCA CCR009 page](https://www.fca.org.uk/firms/consumer-credit-reporting/ccr009), "Limited permission firms … must submit data item CCR009 … plus a reduced amount of information for data item CCR007."

**/what-is-ccr009**
- *Existing:* "CCR009 is a regulatory return: information a firm submits to the Financial Conduct Authority (FCA), not a licence or a tax return."
- *Better:* "CCR009 is the FCA's 'Relevant Ancillary Credit Firm' return, which firms with credit broking and similar permissions have had to submit since 7 May 2025. Most firms report once a year for the calendar year and have 40 business days to submit; firms with £5m or more of credit-related revenue report every six months."
- *Source:* FCA CCR009 page; SUP 16.12.

**/why-fca-applications-get-delayed**
- *Existing:* "FCA applications can be delayed by missing information, inconsistent documents or questions about how the business will operate. Separate preparation time, formal assessment periods and the FCA's operating targets…"
- *Better:* "By law the FCA must decide a complete application within six months and an incomplete one within twelve. Its own target is to decide 95% of new authorisation applications within four months if complete and ten months if incomplete; in April to June 2026 the median decision for new firms took 131 days. Missing information, inconsistent documents and questions about how the business will operate add time."
- *Sources:* FSMA s.55V; FCA *Authorisations operating service metrics Q1 2026/27*, row A1.1. Add "checked [date]".
- *Caution:* Q1 2026/27 is April to June 2026. The median covers all new Part 4A firms, not only consumer credit, so say so in the guide.

**/limited-permission-fca-authorisation-motor-dealers**
- *Existing:* "A motor dealer selling its own vehicles and introducing buyers to third-party finance may qualify for limited-permission secondary credit broking. That is a starting point, not a rule for every dealer."
- *Better:* "If you own the vehicles you sell and introduce buyers to third-party finance, the FCA says you're likely to need limited permission for secondary credit broking. You'll need full permission if you don't own the stock and introduce customers to credit other than hire purchase or consumer hire, or settle part-exchange finance on non-owned stock."
- *Source:* [FCA motor dealers page](https://www.fca.org.uk/firms/authorisation/consumer-credit-brokers/motor-dealers).

**Homepage FAQ "How much will the support cost?"** (`data/faqs.js`)
- *Existing:* "Fees depend on the service and agreed scope. We explain the charges and any ongoing commitment before you proceed…"
- *Better:* "FCA authorisation assistance is £100 to get started, then £100 a month by Direct Debit, with a six-month minimum (£600). The FCA's own application fee is separate and paid to the FCA. CCR009 return assistance and ongoing compliance support are priced to the scope we agree with you."
- *Build:* generate this from `config/offer.js` and gate it on `campaign.showPrice`, like the other price copy, so the post-campaign fallback still applies.

**/common-ccr009-reporting-mistakes**
- *Better:* "The CCR009 errors to check before submitting are the wrong reporting period, using vehicle sales where a question asks for a different measure, unsupported zero answers, double-counted introductions and a saved draft mistaken for a submission." Move the "not a frequency ranking" caveat to the end of section 1.

### 5.4 Repeatable AI test set (UNTESTED)

**No live answer testing was possible from this environment.** There's no access to ChatGPT, Perplexity, Copilot or Google AI Overviews/AI Mode. No result below is simulated, and none is inferred from conventional rankings.

Record, for each run:
- prompt (exact)
- platform and mode
- date
- location (UK)
- whether 009 Compliance is **mentioned**
- whether 009compliance.com is **cited** (a linked source), and which URL
- competing sources cited

| # | Intent | Prompt (exact) |
|---|---|---|
| 1 | Informational | Do car dealers in the UK need FCA authorisation to offer finance? |
| 2 | Informational | What type of FCA permission does a used car dealer need to introduce customers to finance? |
| 3 | Informational | What is the difference between limited and full FCA permission for a motor dealer? |
| 4 | Informational | How do I apply for FCA limited permission as a car dealer? |
| 5 | Informational | How long does FCA authorisation take for a car dealer? |
| 6 | Commercial | How much does FCA authorisation cost for a car dealer, including FCA fees? |
| 7 | Comparison | What's the difference between a consultant's fee and the FCA's application fee for credit broking? |
| 8 | Informational | Do I still need a consumer credit licence to sell cars on finance? |
| 9 | Informational | What is CCR009 and who has to submit it? |
| 10 | Informational | When is the CCR009 return due? |
| 11 | Comparison | What is the difference between CCR009 and CCR007? |
| 12 | Commercial | Who can help my dealership complete its CCR009 return? |
| 13 | Commercial | Recommend a company that helps UK motor dealers with FCA authorisation applications. |
| 14 | Comparison | CreditLicence vs 009 Compliance for FCA authorisation help |
| 15 | Informational | Do van dealers selling to sole traders need FCA permission? |
| 16 | Informational | What FCA rules apply when a dealer offers PCP and HP finance? |
| 17 | Informational | What happens if the FCA refuses my credit broking application? |
| 18 | Branded | What does 009 Compliance do and how much does it charge? |

---

## 6. Competitors and authority

Fetched 21 November 2026, rendered in Chromium (`data/competitors.json`). Search observations came from a **US-based web search tool, so UK rankings are unverified.**

| Site | Role | Their page for our priority intent | What they do better | Where 009 is stronger |
|---|---|---|---|---|
| creditlicence.com/car-dealers | Competes for enquiries | Title "£1,195 FCA Authorisation for Car Dealers to Offer Finance". H2 "Do car dealers need FCA authorisation to offer finance?" | Price in the title. Itemises the FCA £560 application fee and the £1,100 minimum annual fee, plus their £950/year ongoing fee. Claims a "3 business days" pack. Calculators. Service + FAQPage + BreadcrumbList schema. | Lower entry cost (£100 start) with continuing reporting support included. Primary-source citations on every guide. A CCR009/CCR007 cluster they don't have. Named client reviews. |
| thecomplianceguys.co.uk | Competes for enquiries (broad FCA consultancy) | Homepage "The FCA compliance partner you've been looking for", about 109 words | Brand breadth across regulated sectors | Motor-dealer specificity and depth. Their homepage carries almost no indexable text. |
| carlive.co.uk/fca-support | Competes | "FCA Application Support for Car Dealers": £1,299 / £1,499 packages | Commission-economics angle ("keep up to 100%"), interview preparation, 200 free practice questions | Ongoing support after approval. Cited sources. |
| cardealer-consumer-credit.co.uk | Competes | "£1,500 plus VAT" flat fee | States the "typically £560" FCA fee | Clearer, more current content |
| fca.org.uk | Competes for attention on informational queries | /firms/authorisation/consumer-credit-brokers/motor-dealers is the top result for "do car dealers need fca authorisation…" | Authority | 009 adds the dealer-specific worked examples and next steps the FCA doesn't give. **Cite and link the FCA, don't compete with it.** |
| Lenders and trade press (closemotorfinance.co.uk, cardealermagazine.co.uk, am-online.com, kandoo.co.uk) | Attention | Appear for "car dealer compliance FCA support" and "…offer finance" | Trade audience | Mention and partnership opportunities (below) |

**Stale data in the repository.** `data/competitors.js` (checked 25 October 2026) records CreditLicence at **£995**. Their page now says **£1,195 fixed**. The table isn't rendered anywhere at the moment, but recheck it before re-enabling `views/partials/comparison.ejs`.

**Authority.** No backlink data was available: no Search Console Links export, Bing Webmaster Tools or third-party index.

- **Verified mentions:** Companies House only.
- **Prospective opportunities** (not verified links):
  1. A LinkedIn company page and a Google Business Profile, if eligible. A C/O business-centre address may not meet GBP's staffed-premises rules, so check before applying.
  2. Lender and broker partner directories: dealer-support pages like Close Brothers' FCA support page show lenders publish dealer resources.
  3. Trade-press commentary on CCR009 deadlines and FCA fee changes. Car Dealer Magazine and AM Online appear for these queries.
  4. Trade associations relevant to independent dealers (for example NFDA or IMI membership directories). Confirm eligibility first.
- **Coverage:** nationwide coverage is stated on About. Don't create city pages: you have one confirmed location and serve dealers remotely.

---

## 7. Performance data

**Available:**
- a 28-day Search Console export (14 October to 10 November 2026, web): `docs/guide-improvements-2026-11/search-console-export.json`
- the Pages CSV in `docs/guide-release-review/`
- the 16-month figures you supplied in the earlier brief

**Not available:**
- 90-day vs previous-90-day comparisons
- year-on-year data
- UK-only page/query pairs
- Bing Webmaster Tools data
- analytics (disabled)
- first-party AI citation or AI referral data

**Findings from the 28-day export:**
- **Overall:** 22 clicks and 1,090 impressions. The UK accounts for 749 impressions and 21 clicks.
- **Brand:** branded queries had 41 of the 422 query-attributed impressions, and the homepage took 17 of the 22 clicks. Non-brand clicks are near zero.
- **Weak CTR at strong positions:** "do car dealers need fca authorisation to offer finance?" (153 impressions, position 4.1, 1 click). /fca-licence-car-dealers (232 impressions, position 4.9, 0 clicks). Both are addressed by changes not yet live.
- **Close to page one:** "fca authorisation for car finance" (position 20.4), "fca limited permission application" (20.9), "dealer compliance" (12.0), "ccr009" (15.2).
- **Device split:** desktop 888 impressions at position 9.3 (1.46% CTR); mobile 198 impressions at position 7.8 (4.55% CTR).

**Exports that would resolve the unknowns:**
1. Search Console Performance, last 16 months, with dimensions Page + Query, country = United Kingdom, split by device. This resolves CTR by page and query, cannibalisation and the 90-day comparisons.
2. Search Console Page indexing report and URL Inspection for the 7 new URLs after deployment. This confirms indexing.
3. Bing Webmaster Tools Search Performance and the IndexNow submission log.
4. The bookings and enquiry table with the new `source` fields (action 3) after 30 days. This links enquiries to pages.
5. Search Console Links report. This gives the backlink baseline.

---

## 8. Strengths worth preserving

- **Sources and dating:** every guide cites primary FCA or legislation sources inline, and each guide shows when its sources were checked. All 49 external links resolve to the right sections.
- **Accuracy:** careful separation of regulatory requirements from 009's service, plus accurate "the FCA decides" positioning.
- **Technical:** clean redirects, canonicals and robots rules, server-rendered content, no third-party scripts, and fast lab performance.
- **Release gate:** `scripts/release-final-check.cjs` already enforces FAQ/schema parity, price placement, anchors and reduced-motion behaviour. Extend it rather than adding new tooling (IMPLEMENTATION-PLAN.md).
- **Consistent prices:** £100 to start, £100/month, £600 minimum, FCA fee separate, everywhere checked. The £1,000 former price appears only as labelled history on /pricing.

---

## 9. Limitations

| Area | Limitation | Effect |
|---|---|---|
| Indexing | No URL Inspection or Page indexing access | "Technically indexable" is not the same as indexed. The inventory marks this explicitly. |
| Field Core Web Vitals | No CrUX or RUM data; the site is likely below CrUX traffic thresholds | Lab figures only (Chromium, throttled) |
| Rankings | The web search tool is US-based; no UK rank tracker | UK positions come only from the Search Console export |
| AI answers | No access to ChatGPT, Perplexity, Copilot or AI Overviews | Test set provided; all results untested |
| Bing documentation | Bing Webmaster Guidelines page didn't render | Copilot-specific claims left out |
| Backlinks | No link data | Opportunities are prospective only |
| Search Console | 28-day snapshot only, no page/query pairing | No 90-day or year-on-year comparison |
| Crawler access | Spoofed user agents only | Genuine bot access through Cloudflare unverified |
| Customer areas | Not entered, by design | Portal pages assessed only on their public responses |

---

## If we could make only three changes before the next deployment

The branch `seo-geo-release-2026-11` is what will be deployed. These three are changes to add to it first.

1. **Add enquiry source capture: landing page, referrer category and topic, stored with bookings and contact enquiries.**
   - **Evidence:** today you can't tell whether any enquiry came from organic search, a guide or an AI assistant. Analytics is off, and `meeting_bookings` has no source column.
   - **Why it's first:** every other change in this audit is a hypothesis about enquiries. This is the only one that makes the others measurable, it's server-side, and it needs no new cookies or third parties.
2. **Add an "Our fees and the FCA's fees" block to /fca-authorisation-motor-dealers and /pricing, and make the homepage cost FAQ concrete.**
   - **Evidence:** the offer page is the highest-intent page (259 impressions, position 10.2, 3 clicks). Its nearest competitor states the FCA's £560 and £1,100 beside its own price. Your homepage FAQ, which is also in schema, gives answer engines no figure. Searches like "consumer credit licence uk cost" and "fca licence price" show dealers asking exactly this.
   - **Effort:** the figures are verified and dated (§3.1), so this is copy and template work only.
3. **Add the 8 P1 internal links, including links to the new cost, how-to-apply, PCP/HP and CCR007 guides from the offer, pricing, CCR009 and motor-finance pages.**
   - **Evidence:** the six new guides target the commercial queries where you rank between 13 and 42, but locally they have only 2–5 contextual inlinks, mostly from the hub. Without links from the pages that already rank, they launch with almost no internal signal.
   - **Effort:** each link is a one-line template change.

These come before the opening rewrites (action 4) for two reasons. The rewrites need careful regulatory wording and a review. And without measurement and discovery in place, their effect couldn't be seen.
