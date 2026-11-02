# 009 Compliance — dashboard inside your existing website

This folder replaces the separate Cloudflare dashboard. It runs with your existing Node/Express website on one Render web service. No public website source files need replacing or editing. Nothing has been deployed.

## Put the folder in the right place

Unzip this download, then put its **dashboard** folder beside your website's existing **server.js** and **package.json**. Do not put it inside `public` or `views`. If a folder called `dashboard` already exists there, keep a backup and move it aside first; do not merge two dashboard versions.

Keep the existing website `.env`, dependencies, customer database and all website files. The supplied dashboard includes compiled assets, so you do not need to install the old dashboard dependencies or run Wrangler. Your website's normal `npm install` must already have been completed, using Node 22 or newer.

**A copied folder cannot start itself. The required start command is now:**

```bash
node dashboard/start.cjs
```

Run that from the website folder. Do not run `npm start` or the old dashboard dev server at the same time. Your existing `npm start` remains unchanged and still starts just the public website.

## Keep your existing dashboard account and records

Do this BEFORE starting the new dashboard or creating another account. Stop the old dashboard first and keep a complete backup of its folder, including `.wrangler/state`. Do not delete it.

From the website folder, run:

```bash
node dashboard/scripts/import-local.cjs "/absolute/path/to/your/OLD-dashboard-folder"
```

On Windows, use your full Windows path inside the quotes. Point to the old folder containing `.wrangler`, not to this new `dashboard` folder.

The import reads a temporary copy of the old local SQLite databases and document files entirely offline. It preserves account IDs/password hashes, saved companies and returns, revisions, notification history, templates and generated documents. Existing sessions are deliberately not copied: sign in once with the same account and select **Remember my login**. Device notifications must be enabled again for the new address.

The importer refuses to overwrite an existing destination or continue when a referenced document is missing. If you already started the new dashboard, choose a NEW empty destination with `DASHBOARD_DATA_DIR`; do not delete a data folder that might contain records. Older/ambiguous local storage layouts fail with an error rather than guessing.

If you want a fresh empty dashboard instead, create the owner account:

```bash
node dashboard/scripts/account.cjs
```

Enter the account email, name and a password of 15–128 characters. Input is hidden. The first account is the owner who sees website call bookings. Additional staff accounts get separate workspaces and do not automatically share the owner's records. This is a staff account, separate from website customer registration.

Password reset, without deleting saved records:

```bash
node dashboard/scripts/account.cjs --reset
```

## Test locally

Keep your current working website booking settings. Set or update this value in the website's existing `.env` if necessary (do not add duplicate entries):

```dotenv
PORTAL_ORIGIN=http://localhost:3001
```

The default website port remains 3000. Start with `node dashboard/start.cjs`, then open:

- Public website: `http://localhost:3000`
- Staff dashboard: `http://localhost:3001`

Use exactly the configured dashboard address; `localhost` and `127.0.0.1` are different origins. If port 3001 is occupied, change `PORTAL_ORIGIN` to another free localhost port. Keep it different from the website port. The launcher starts both listeners in one process during development.

For a safe test, keep `BOOKING_CONFIRMATION_EMAIL_ENABLED=false`. Book a call on the website using dummy details and a test phone number, then open **Calls** in the owner's dashboard. The booking is read directly from the same website database. No Google Meet link, Google login, separate dashboard booking URL or dashboard copy of the API key is needed.

The WEBSITE still requires its existing `BOOKING_ENABLED=true`, `BOOKING_PUBLIC_URL` matching its public origin, and a `BOOKING_API_KEY` of at least 32 characters because its existing booking configuration checks those values. This integration does not remove or weaken that website check. Keep your other website environment settings unchanged.

Local staff data defaults to `.009-dashboard-data` in the website folder. It contains `staff.sqlite` and private document blobs, with a generated `.gitignore` to keep them out of ordinary Git adds. Back up this entire directory separately; never place it in `public` or include it in a website ZIP.

## When you choose to put it on Render

No hosting or DNS settings were changed for you.

1. Add this dashboard folder to the same website project/repository. Keep your existing website build command. The included dashboard build is ready to run.
2. Change the Render **Start Command** to `node dashboard/start.cjs`.
3. Set these Render environment values, using a path on your actual persistent disk:

```dotenv
NODE_ENV=production
PORTAL_ORIGIN=https://dashboard.009compliance.com
DASHBOARD_DATA_DIR=/var/data/009-dashboard
```

Keep the existing `DB_PATH`, `SESSION_SECRET`, website URLs, email and Sheets configuration. Do not change the website's `BASE_URL` to the dashboard URL. Render supplies `PORT` automatically; production uses one listener for both domains.

4. Add `dashboard.009compliance.com` under **Custom Domains** on that SAME Render web service. At 123 Reg, add the `dashboard` CNAME pointing to the `your-service.onrender.com` value shown by Render, then verify it in Render. Keep the existing root/www records and nameservers.
5. In the Render service shell, run `node dashboard/scripts/account.cjs` to create the production owner, unless you have securely transferred your existing staff data. Local accounts and records are not automatically uploaded with this code ZIP.
6. Check that the website still opens normally and the dashboard subdomain opens the staff sign-in page. Test with isolated details before accepting live bookings.

**Persistent storage is required.** Render's default filesystem is temporary. The staff SQLite database and document directory must be on a persistent disk, and your existing customer database must remain durable too. Render persistent disks require a paid service. Use one service instance for this local SQLite/filesystem setup. The server refuses production startup if `DASHBOARD_DATA_DIR` is missing, but it cannot verify that the configured path is actually a mounted persistent disk.

To preserve local staff records on Render, stop local writes and securely transfer the entire private data directory to a NEW directory on the Render persistent disk, then point `DASHBOARD_DATA_DIR` at that directory and restart. Do not overwrite an active database, upload data through Git, or replace the website customer database. Keep a backup and verify the account, record counts and document downloads after transfer.

## Notifications and remembered login

Background reminder/call checks run approximately every minute while the server is running. They do not require an open browser. An offline or sleeping server cannot deliver on time; pending checks resume when it runs. In-app notifications work without push keys.

For device push alerts, keep your existing `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`, or generate a pair on your own machine:

```bash
node dashboard/scripts/push-keys.cjs
```

Store the printed values in your website environment/Render settings, keep the private key secret, and restart. Then use Dashboard → Settings → Enable on this device → Test. Do not regenerate keys on every start. iPhone/iPad push needs the supported Home Screen web-app setup. Email fallback for dashboard reminders is not implemented; website booking confirmation email is a separate existing feature.

Leave `BOOKING_OWNER_ID` unset to use the first owner account. If you previously set it, it must match that account's preserved workspace ID. Leave `DASHBOARD_SCHEDULER_ENABLED` unset for normal operation; `false` disables background checks for isolated tests. `DASHBOARD_MAINTENANCE_KEY` is optional and unnecessary for normal use; external maintenance endpoints stay denied without a separate strong key.

Remembered sessions have no fixed server expiry and their browser cookie is renewed during use. Signing out, changing/resetting a password, disabling an account, clearing cookies or browser cookie limits can require signing in again. Passwords are hashed, and readable passwords are never stored in cookies.

## Rebuilding and regression tests (optional)

You only need dashboard build dependencies if editing its source or running its tests:

```bash
npm --prefix dashboard ci --include=dev
npm --prefix dashboard run typecheck
npm --prefix dashboard run build
npm --prefix dashboard test
```

Keep the website's dependencies installed at the website root. The dashboard reuses its Express, dotenv and sqlite3 packages. The tests use temporary databases and mocked push delivery; no real emails or appointments are sent.

See `VERIFICATION.md` for coverage and limits. To roll back the launcher, restore the original Render start command (`npm start` / `node server.js`); the website files remain intact. Preserve the private dashboard data folder for later use.

Official setup references: [Render custom domains](https://render.com/docs/custom-domains), [Render persistent disks](https://render.com/docs/disks).
