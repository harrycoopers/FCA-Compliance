# Security and backend update — 1 November 2026

This package updates the supplied 009 Compliance website. It has not been deployed. Marketing, pricing, legal and guide copy is retained, as are the animation source files. Functional account/report messages and form security controls have changed.

## What changed

- **Customer isolation:** report reads and edits require both report ID and the authenticated owner ID before any database or external write. Google Sheets updates check report and owner IDs; ambiguous or conflicting rows are left untouched for investigation.
- **Lost updates and duplicate reports:** edits carry a revision number; stale saves return a conflict instead of overwriting newer data. Database triggers prevent new duplicate customer/month reports, including simultaneous requests. Existing duplicates are preserved. Report versions are recorded in `report_history`.
- **Reliable Sheets transfers:** database triggers queue changes durably. Retries survive process restarts, serialize workers, use backoff and re-check identities after ambiguous responses. Saved reports show pending/synced state. Dealer updates read the complete database record and preserve creation dates and administrator-managed spreadsheet columns. Unsubscribing no longer overwrites firm details or agreement information; accepting terms does not reactivate reminders.
- **Input and spreadsheet safety:** server-side report validation, declaration enforcement, allowed fields, bounded numeric/date inputs and RAW Sheets writes prevent formula execution and malformed records. Reporting-month selection also works without JavaScript. Contact messages validate fields and escape HTML.
- **Accounts:** passwords are hashed before pending registration is saved; hidden plaintext password fields are removed. New/reset passwords require at least 12 characters and at most 72 UTF-8 bytes. Existing password hashes remain valid. Email verification is enforced and can be resent. Verification/reset tokens are hashed, expiring and single-use. Password reset invalidates existing authenticated sessions.
- **Request and session protection:** CSRF tokens protect forms and booking requests; foreign-origin requests are rejected. Login, email actions, enquiries, reports and booking endpoints have persistent limits. Sessions use SQLite with HttpOnly/SameSite cookies, Secure cookies in production and an eight-hour idle timeout. Logout and unsubscribe require confirmation via POST. Sensitive account/report pages exclude analytics and use no-store caching. Security headers and request-size limits were added.
- **Bookings:** server and UI agree on weekdays; workers are protected against duplicate processing; calendar availability is checked again before event creation. Disabled integrations do not run delivery jobs. Shutdown waits for background work.
- **Dependencies:** bcrypt, EJS and compression were updated; nodemon was replaced by Node's built-in watch mode. The lockfile audit reported zero known vulnerabilities at verification time. This is not a guarantee against undiscovered vulnerabilities.

## Installation and migration

1. Back up the deployed source, environment configuration and production SQLite database before replacing code. Stop the application before copying SQLite files, or use SQLite's supported online backup mechanism; copying only the main file while WAL writes are active is unsafe.
2. Retain the existing production database and environment secrets. **Do not replace the production database with a new empty database.** This ZIP contains no customer database, credentials or node_modules.
3. Use supported Node.js 22 or newer (tested with Node 24.22.1), then run `npm ci`, `npm test`, `npm run build` from the `website` directory. Start with `npm start`.
4. Set `NODE_ENV=production`, a strong random `SESSION_SECRET` of at least 32 characters, and `BASE_URL=https://009compliance.com` (or the exact HTTPS origin in use). Keep the same secret across restarts. Development generates a temporary secret when none is configured.
5. Set `DB_PATH` to the existing database on a persistent writable disk. SQLite and its WAL/SHM files must remain together. Run this deployment against one shared local database, not separate per-instance ephemeral databases. Retain tested backups and restrict filesystem access to the service account.
6. The production default trusts one reverse-proxy hop. Verify that matches the hosting topology and that the proxy overwrites forwarded headers. Set `TRUST_PROXY` to the appropriate trusted IP/subnet list or hop count if necessary. HTTPS termination must supply the correct protocol for Secure cookies and origin checks.
7. Check `EMAIL_USER` and `EMAIL_PASS` for the existing Gmail SMTP configuration. Email verification is now required: working outgoing email is necessary for new and previously unverified customers to access the portal. Keep existing Google Sheets and booking credentials/configuration; consult `booking.env.example` and the existing booking documentation.
8. On startup, additive migrations create security/session/history/queue tables and columns. Existing customer records, password hashes and reports are retained. Migrations were tested against an older schema and repeated safely. Old sessions require a fresh login. Legacy plaintext reset/verification links are invalidated; users must request new links. Historical duplicate accounts/reports are not silently deleted or merged.
9. Before release, use a staging database and your staging integrations to verify real email delivery, verification/reset links, Sheets permissions and actual booking/OAuth behavior. Check login through the production proxy, then test one report and inspect its sync status.

## Sheets operations

New changes are queued automatically; old records are not blindly bulk-resubmitted. The existing Submissions A:T and Dealers A:Q layout is retained. Writes use RAW input, so dates and phone numbers are literal strings. Check downstream formulas if they depend on Google's automatic type conversion.

The `sheet_jobs` table is the durable retry queue. A maintainer can inspect it locally with `SELECT kind, entity_id, attempts, next_attempt, error FROM sheet_jobs;`. This does not expose report content. A `sheet_identity_conflict` requires checking existing row IDs/owners and any duplicated rows before resuming. Do not reorder identity columns or manually overwrite another customer's row. Retry failures remain queued; the worker runs every 30 seconds with failure backoff up to one hour. A database backup/restore and any historical data repair remain separate operational tasks.

Report history contains customer data and needs the same access controls, backup and retention handling as current reports. The patch preserves evidence; it does not invent a data-deletion policy. No application-level encryption of the SQLite database is claimed.

## Verification and limits

- `npm test`: 47 passing Node test results (45 checks plus two parent suites), zero failures/skips. Includes two-account isolation, stale edits, simultaneous submissions, Sheets retries/identity conflicts, registration/verification, password recovery/session revocation, CSRF, malformed bodies, rate limits, migration preservation and booking concurrency.
- All application/browser JavaScript parses; current and legacy EJS templates compile. All 58 asset-manifest entries resolve to matching built assets. Production asset build succeeds.
- Browser preview: 43 rendered page states at 390px and 1280px, 86 checks, with no detected page overflow, broken loaded images or missing/duplicate H1s. Account/report pages contained no analytics tag. The report form and verification notice were also inspected manually; report-month selection was exercised.
- Source comparison: all 242 original files retained. Marketing/guide/configuration content, animation sources, original styles, images and fonts are preserved; necessary security UI and generated assets are updated.
- SMTP, Google Sheets, Google Calendar/Meet and OAuth tests use isolated mocks; no live messages, appointments or customer changes were made. Browser QA used rendered snapshots with external services and submissions blocked. Live hosting/TLS, production secrets, real database contents and real integration permissions were not inspected.
- A clean native SQLite rebuild in this container was blocked by a filesystem permission error while unpacking Node headers. Tests used the already available native binding for the exact same sqlite3 6.0.1 version; that binding is not shipped. Confirm `npm ci` succeeds in the deployment environment.

This update addresses the identified security/backend defects; it is not a guarantee that all possible bugs are absent or a legal-compliance certification. The previous legal/commercial-content findings are outside this patch.
