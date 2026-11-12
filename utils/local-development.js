'use strict';
const fs = require('node:fs');
const path = require('node:path');

// npm run dev deliberately does not import the deployment .env or its secrets.
function configureLocalDevelopment(root, env = process.env) {
  const file = path.join(root, '.env.local');
  const local = fs.existsSync(file) ? require('dotenv').parse(fs.readFileSync(file)) : {};
  const configuredPath = env.DEV_DB_PATH || local.DB_PATH || '.local/development/db.sqlite';
  const port = env.DEV_PORT || local.PORT || '3000';
  if (!/^\d+$/.test(port) || Number(port) > 65535) throw Error('Local PORT must be a number between 0 and 65535.');
  if (process.platform === 'win32' && /^[\\/](?![\\/])/.test(configuredPath)) {
    throw Error('Local DB_PATH must use a Windows drive-qualified path or a project-relative path, not a Linux /var/data path.');
  }
  const dbPath = path.resolve(root, configuredPath);
  // Ignore inherited deployment credentials too. A local preview cannot enable
  // outbound integrations by setting them in .env.local (only DB_PATH/PORT read).
  for (const key of Object.keys(env)) {
    if (/^(GOOGLE_|EMAIL_|SMTP_|BOOKING_|SHEETS_|REMINDER_|DASHBOARD_|PORTAL_)/.test(key)
      || ['DB_PATH','PORT','NODE_ENV','BASE_URL','SESSION_SECRET','TRUST_PROXY','CUSTOMER_ID_FLOOR'].includes(key)) delete env[key];
  }
  Object.assign(env, {
    NODE_ENV: 'development', LOCAL_PREVIEW: 'true', DB_PATH: dbPath, PORT: port,
    BASE_URL: `http://127.0.0.1:${port}`, BOOKING_ENABLED: 'false',
    BOOKING_CONFIRMATION_EMAIL_ENABLED: 'false', GOOGLE_SHEETS_SYNC_ENABLED: 'false'
  });
  return { dbPath, port: Number(port) };
}
module.exports = { configureLocalDevelopment };
