# Verification — 1 November 2026

## What changed

- Replaced the dashboard's Cloudflare Workers/D1/R2 runtime with Node/Express, a separate SQLite staff database and private filesystem document storage.
- Added a launcher inside `dashboard/` which loads the existing exported website app and routes the dashboard hostname before website middleware. No website source edits are required.
- Preserved the React dashboard, CSS, assets, forms and interactions. The scheduler explanation now describes the Node background checks.
- Calls read the website's existing booking database directly. Customer records remain in their original database; staff records and files use separate storage.
- Preserved account login, remembered sessions, owner isolation, origin checks, record revisions, document approval rules, private downloads and reminder/push behaviour.
- Added offline import, account create/reset and optional push-key utilities. Import refuses overwrites and incomplete document transfers.
- Included ready-built assets and source; excluded credentials, databases, old platform state and node_modules.

## Passed checks

- **51 existing website tests:** public-page rendering, metadata, schema, asset hashes, customer isolation, CSRF, report revision checks, email verification/password reset, sessions, Google Sheets retry safeguards and phone booking tests.
- **17 new dashboard/integration tests:** SQLite transaction rollback/isolation; safe file storage; login, production cookie attributes and both session lifetimes; owner/account separation; simultaneous record edits; direct booking reads; call notification deduplication; mocked encrypted web-push delivery and provider validation; DOCX upload/review/generation/download; reminder deduplication; restart persistence; password/session revocation; offline data/document import and failure handling; production configuration validation; complete launcher and normal website booking HTTP flow.
- TypeScript validation and production browser/server builds passed.
- The full launcher was exercised against an isolated copy of the real website with installed WEBSITE dependencies only; the copied dashboard had no node_modules. Public website routes and customer login remained separate from staff routes. Tests also verified dashboard hostname routing on the same listener and rejection of forwarded-host spoofing as a routing mechanism.
- A file hash comparison found **269 website application files unchanged** from the supplied website version. This comparison excluded dependencies, environment files and runtime databases/logs.
- Manual Chrome interface checks used isolated dummy-data fixtures at **320, 390, 768 and 1440 CSS pixels**: login presentation, mobile navigation, calls agenda/period controls, phone-details modal, company form, return form, documents upload screen, calendar and settings. The CSS and principal dashboard components were retained. No application JavaScript errors were observed; browser-extension metadata errors were unrelated to the app.

## Limits

- Browser checks used a local UI fixture; authentication and data writes were verified with real Node HTTP integration tests, not a manual signed-in browser session.
- No physical iPhone/Android device, Safari/iOS browser, actual push-provider delivery, live SMTP or live Google Sheets integration was exercised in this migration. Push was mocked; no real email was sent.
- Render deployment, 123 Reg DNS and production TLS were not changed or tested. Those require the setup steps in START-HERE.md.
- No real customer database or personal account was used or included. The offline importer was checked against the known local account database and an isolated document-storage fixture. Unsupported/ambiguous old layouts stop with an error rather than guessing.
- Existing local account/data directories are not automatically sent to Render. Secure transfer or production account creation is still needed.
- Scheduler delivery depends on a running server and, for push, correctly configured keys/browser permissions. The SQLite/filesystem design is for one service instance with persistent disk storage.
- This is a tested integration for the supplied 009 website version, not a claim that every possible hosting configuration or device is bug-free.
