# Local development on Windows

Run `npm run dev` from the repository. This workspace's ignored `.env.local`
selects port 3100 because another process already occupies port 3000. Open
<http://127.0.0.1:3100/do-motor-dealers-need-fca-authorisation>.
The server binds to this machine only. Without a local override the default
port is 3000; the startup log always shows the actual URL.

The development launcher uses `.local/development/db.sqlite`, resolved relative
to the project root. It creates missing parent directories and runs the normal
application, security and booking migrations before reporting ready. It reuses
an existing local file without deleting or replacing it. The older root-level
`db.sqlite` and its WAL/SHM files are left untouched; no customer data is copied
into the development database automatically.

Optional: copy `local.env.example` to `.env.local` and set `DB_PATH` and `PORT`.
Use a project-relative path or a full Windows path for the database. The launcher
ignores other settings in that file. Shell variables `DEV_DB_PATH` and `DEV_PORT`
can override these two local settings. Restart after changing them.

`npm run dev` deliberately ignores the deployment `.env`, discards inherited
integration credentials, and disables outbound email (including reminders),
Sheets synchronization, public booking writes and the private booking bridge.
The existing booking page can be viewed, but no real appointment can be made.
Email-dependent forms report that sending is unavailable; they do not send mail.
No VAT/cancellation wording or campaign confirmation controls are changed.

`npm start` remains the deployment entry point. Its `.env`, production database
path, persistent-storage preflight and customer-ID protections are unchanged.
Do not change a deployment database path to make a local preview work.

The failing deployment setting `/var/data/db.sqlite` resolves on this Windows
machine to `C:\var\data\db.sqlite`, whose parent directory does not exist.
SQLite cannot create a missing parent directory. The old open call also lacked
an error callback, so a failed open could emit an unhandled SQLite error.
Startup now waits for the open and migrations and reports the resolved path
and error code. Invalid existing database files are not replaced.

`.env`, `.env.local`, `.local/` and SQLite database/journal files are ignored by
Git. Keep them untracked. No production secrets belong in this example or docs.

Checks: `npm test` includes local configuration isolation, missing directories,
data-preserving reopen, clean open/migration failures, normal schema setup and
disabled local delivery/bookings. Existing production/security checks also run.
