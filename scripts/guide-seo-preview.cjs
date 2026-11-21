'use strict';
// Isolated local preview: never loads production credentials, sends mail or syncs Sheets.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), '009-guide-preview-'));
for (const key of Object.keys(process.env)) if (/^(GOOGLE_|SMTP_|BOOKING_|SHEETS_)/.test(key)) delete process.env[key];
process.env.DB_PATH = path.join(temp, 'preview.sqlite');
process.env.SESSION_SECRET = 'isolated-guide-preview-only';
process.env.CANONICAL_BASE_URL = 'https://009compliance.com';
const load = Module._load;
Module._load = function(id, parent) {
  if (id === 'dotenv') return { config: () => ({}) };
  if (id === './utils/email' && parent.filename.endsWith('server.js')) return { sendEmail: async () => { throw new Error('Email disabled in guide preview'); } };
  return load.apply(this, arguments);
};
const app = require('../server');
Module._load = load;
const server = app.listen(3099, '127.0.0.1', () => console.log('Guide preview: http://127.0.0.1:3099'));
async function stop() {
  await new Promise(resolve => server.close(resolve));
  await app.locals.stopBackgroundTasks();
  await new Promise(resolve => app.locals.db.close(resolve));
  if (path.dirname(path.resolve(temp)) !== path.resolve(os.tmpdir()) || !path.basename(temp).startsWith('009-guide-preview-')) {
    throw new Error('Refusing to remove a path outside the preview temporary directory');
  }
  fs.rmSync(temp, { recursive: true, force: true });
}
process.on('SIGINT', () => stop().then(() => process.exit(0)));
process.on('SIGTERM', () => stop().then(() => process.exit(0)));
