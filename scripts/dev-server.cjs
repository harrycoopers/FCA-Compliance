'use strict';
const path = require('node:path');
let app;
(async () => {
  const { dbPath } = require('../utils/local-development').configureLocalDevelopment(path.resolve(__dirname, '..'));
  console.log(`[009 Local] Database: ${dbPath}`);
  console.log('[009 Local] Deployment .env ignored. Emails, reminders, Sheets sync and real bookings disabled.');
  app = require('../server');
  await app.locals.start();
})().catch(async error => {
  console.error(`[009 Startup] Local preview failed (${error.code || 'configuration/migration'}): ${error.message}`);
  if (error.syscall === 'listen') console.error(`[009 Startup] Local port ${process.env.PORT} is unavailable. Set PORT in .env.local to an unused port.`);
  else if (process.env.LOCAL_PREVIEW === 'true') console.error(`[009 Startup] Database: ${process.env.DB_PATH}. Check .env.local DB_PATH and folder permissions; no existing database was replaced.`);
  if (app) await app.locals.close().catch(() => {});
  process.exitCode = 1;
});
