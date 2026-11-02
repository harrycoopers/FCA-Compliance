'use strict';
const crypto = require('node:crypto');
const { query } = require('./security');
const { fields } = require('./report-validation');
function createSheetsSync({ db, google, ready, env = process.env }) {
  const q = query(db), owner = crypto.randomBytes(24).toString('hex');
  let running = null, timer, client;
  function spreadsheetId() {
    if (env.NODE_ENV === 'production') return env.GOOGLE_SHEETS_SPREADSHEET_ID;
    const test = env.GOOGLE_SHEETS_TEST_SPREADSHEET_ID;
    return env.GOOGLE_SHEETS_TEST_SYNC_ENABLED === 'true' && test && test !== env.GOOGLE_SHEETS_SPREADSHEET_ID ? test : '';
  }
  function configured() { return env.GOOGLE_SHEETS_SYNC_ENABLED !== 'false' && Boolean(env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_PRIVATE_KEY && spreadsheetId()); }
  async function api() {
    if (!configured()) throw Error('not_configured');
    if (!client) client = new google.auth.JWT({ email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g,'\n'), scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
    // Google API request timeout also bounds reads/writes; OAuth transport has its own timeout.
    client.transporter?.defaults && (client.transporter.defaults.timeout = 15000);
    return google.sheets({ version: 'v4', auth: client }).spreadsheets.values;
  }
  const options = { timeout: 15000 };
  async function read(values, range) { return (await values.get({ spreadsheetId: spreadsheetId(), range }, options)).data.values || []; }
  async function update(values, range, row) { await values.update({ spreadsheetId: spreadsheetId(), range, valueInputOption: 'RAW', requestBody: { values: [row] } }, options); }
  async function append(values, sheet, row) { await values.append({ spreadsheetId: spreadsheetId(), range: `${sheet}!A1`, valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS', requestBody: { values: [row] } }, options); }
  const email = value => String(value || '').trim().toLowerCase();
  async function checkedDealers(values) {
    const rows = await read(values, 'Dealers!A2:C');
    const users = await q.all('SELECT id,email FROM users');
    const ids = new Set(), emails = new Set();
    for (const row of rows) {
      if (!row.some(value => String(value || '').trim())) continue;
      const id = String(row[0] || '').trim(), address = email(row[2]);
      const matches = users.filter(user => String(user.id) === id && email(user.email) === address);
      if (!/^[1-9]\d*$/.test(id) || !address || ids.has(id) || emails.has(address) || matches.length !== 1 || users.filter(user => email(user.email) === address).length !== 1) throw Error('sheet_identity_conflict');
      ids.add(id); emails.add(address);
    }
    return rows;
  }
  async function syncReport(id) {
    const report = await q.get('SELECT * FROM reports WHERE id=?', [id]);
    if (!report) return;
    const user = await q.get('SELECT * FROM users WHERE id=?', [report.user_id]);
    if (!user) throw Error('missing_owner');
    const data = JSON.parse(report.data), values = await api();
    await checkedDealers(values);
    const rows = await read(values, 'Submissions!A:F');
    const matches = rows.map((row, index) => ({ row, index })).filter(x => String(x.row[0]).trim() === String(report.id));
    // Fail closed on conflicting or ambiguous sheet identities. Never overwrite another dealer.
    if (matches.length > 1 || matches.some(x => String(x.row[1]).trim() !== String(user.id) || email(x.row[3]) !== email(user.email) || String(x.row[5]).trim() !== report.reporting_month)
      || rows.some(row => String(row[1]).trim() === String(user.id) && String(row[5]).trim() === report.reporting_month && String(row[0]).trim() !== String(report.id))) throw Error('sheet_identity_conflict');
    const row = [String(report.id), String(user.id), user.name, user.email, user.mobile_number || '', report.reporting_month, report.updated_at || report.created_at, ...fields.map(key => data[key] ?? '')];
    if (matches.length) await update(values, `Submissions!A${matches[0].index + 1}:T${matches[0].index + 1}`, row);
    else await append(values, 'Submissions', row);
    await q.run("UPDATE reports SET sync_status='synced' WHERE id=? AND revision=?", [id, report.revision]);
  }
  async function syncDealer(id) {
    const user = await q.get('SELECT * FROM users WHERE id=?', [id]);
    if (!user) return;
    const values = await api(), rows = await checkedDealers(values);
    const matches = rows.map((r, i) => ({ id: String(r[0]).trim(), row: i + 2 })).filter(x => x.id === String(id));
    if (matches.length > 1) throw Error('sheet_identity_conflict');
    // Always read the authoritative DB record, never a partial form/session object.
    const base = [String(id), user.name, user.email, user.mobile_number || '', user.firm_name || '', user.is_active === 0 ? 'FALSE' : 'TRUE', user.created_at];
    if (!matches.length) return append(values, 'Dealers', [...base, '', '', '', '', '', user.unsubscribe_token || '', '', '', user.terms_accepted_at || '', user.terms_version || '']);
    const row = matches[0].row;
    // Preserve original Sheets creation metadata and administrator-managed H:L / N:O columns.
    await update(values, `Dealers!B${row}:F${row}`, base.slice(1, 6));
    await update(values, `Dealers!M${row}:M${row}`, [user.unsubscribe_token || '']);
    await update(values, `Dealers!P${row}:Q${row}`, [user.terms_accepted_at || '', user.terms_version || '']);
  }
  async function work(limit) {
    await ready;
    if (!configured()) return;
    const now = Date.now();
    const lock = await q.run("INSERT INTO worker_locks(name,owner,expires) VALUES('sheets',?,?) ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,expires=excluded.expires WHERE worker_locks.expires<?", [owner, now + 180000, now]);
    if (!lock.changes) return;
    const heartbeat = setInterval(() => q.run("UPDATE worker_locks SET expires=? WHERE name='sheets' AND owner=?", [Date.now() + 180000, owner]).catch(() => {}), 10000); heartbeat.unref();
    try {
      const jobs = await q.all('SELECT * FROM sheet_jobs WHERE next_attempt<=? ORDER BY next_attempt,kind,entity_id LIMIT ?', [Date.now(), limit]);
      for (const job of jobs) {
        // Verify our lease before each external side effect; one worker serializes read/upsert.
        const held = await q.get("SELECT owner FROM worker_locks WHERE name='sheets' AND expires>?", [Date.now()]);
        if (held?.owner !== owner) break;
        try {
          await (job.kind === 'report' ? syncReport(job.entity_id) : syncDealer(job.entity_id));
          await q.run('DELETE FROM sheet_jobs WHERE kind=? AND entity_id=? AND generation=?', [job.kind, job.entity_id, job.generation]);
        } catch (error) {
          const reason = error.message === 'sheet_identity_conflict' ? 'sheet_identity_conflict' : 'sync_failed';
          await q.run('UPDATE sheet_jobs SET attempts=attempts+1,error=?,next_attempt=? WHERE kind=? AND entity_id=? AND generation=?', [reason, Date.now() + Math.min(3600000, 30000 * 2 ** Math.min(job.attempts, 7)), job.kind, job.entity_id, job.generation]);
          if (job.kind === 'report') await q.run("UPDATE reports SET sync_status='pending' WHERE id=? AND EXISTS(SELECT 1 FROM sheet_jobs WHERE kind='report' AND entity_id=?)", [job.entity_id, job.entity_id]);
          console.error(reason === 'sheet_identity_conflict' ? '[Sheets] Identity conflict: write stopped. Reconcile the database and spreadsheet before retrying.' : '[Sheets] Synchronisation pending; inspect the local sheet_jobs queue.');
        }
      }
    } finally { clearInterval(heartbeat); await q.run("DELETE FROM worker_locks WHERE name='sheets' AND owner=?", [owner]); }
  }
  function flush(limit = 10) { if (!running) running = work(limit).finally(() => { running = null; }); return running; }
  function start() { timer = setInterval(() => flush().catch(() => console.error('[Sheets] Retry worker unavailable.')), 30000); timer.unref(); flush().catch(() => {}); }
  async function stop() { clearInterval(timer); if (running) await running; }
  return { configured, flush, start, stop };
}
module.exports = { createSheetsSync };
