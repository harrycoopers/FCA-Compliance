'use strict';
const crypto = require('node:crypto');
const session = require('express-session');
const query = db => ({
  run: (sql, args = []) => new Promise((resolve, reject) => db.run(sql, args, function (e) { e ? reject(e) : resolve({ id: this.lastID, changes: this.changes }); })),
  get: (sql, args = []) => new Promise((resolve, reject) => db.get(sql, args, (e, r) => e ? reject(e) : resolve(r))),
  all: (sql, args = []) => new Promise((resolve, reject) => db.all(sql, args, (e, r) => e ? reject(e) : resolve(r)))
});
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');
const safeEqual = (a, b) => { if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y); };
const validEmail = value => typeof value === 'string' && value.length <= 254 && /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(value);
function passwordError(value) {
  if (typeof value !== 'string' || value.length < 12) return 'Use a password of at least 12 characters.';
  // bcrypt only considers the first 72 bytes; reject rather than silently truncate.
  if (Buffer.byteLength(value, 'utf8') > 72 || value.includes('\0')) return 'Use a password of no more than 72 UTF-8 bytes, without null characters.';
  return '';
}
class SQLiteSessionStore extends session.Store {
  constructor(db, ready) { super(); this.q = query(db); this.ready = ready; this.timer=setInterval(()=>this.ready.then(()=>this.q.run('DELETE FROM portal_sessions WHERE expires<=?',[Date.now()])).catch(()=>{}),15*60000);this.timer.unref(); }
  close(){clearInterval(this.timer);}
  get(sid, cb) { this.ready.then(() => this.q.get('SELECT data FROM portal_sessions WHERE sid=? AND expires>?', [sid, Date.now()])).then(row => { try { cb(null, row ? JSON.parse(row.data) : null); } catch (e) { cb(e); } }, cb); }
  set(sid, value, cb = () => {}) { this.ready.then(() => this.q.run('INSERT INTO portal_sessions(sid,data,expires) VALUES(?,?,?) ON CONFLICT(sid) DO UPDATE SET data=excluded.data,expires=excluded.expires', [sid, JSON.stringify(value), new Date(value.cookie.expires).getTime() || Date.now() + 8 * 3600000])).then(() => cb(), cb); }
  destroy(sid, cb = () => {}) { this.ready.then(() => this.q.run('DELETE FROM portal_sessions WHERE sid=?', [sid])).then(() => cb(), cb); }
  touch(sid, value, cb = () => {}) { this.ready.then(() => this.q.run('UPDATE portal_sessions SET expires=? WHERE sid=?', [new Date(value.cookie.expires).getTime() || Date.now() + 8 * 3600000, sid])).then(() => cb(), cb); }
}
async function initialize(db) {
  const q = query(db);
  await q.run('PRAGMA busy_timeout=5000');
  await q.run('PRAGMA foreign_keys=ON');
  await q.run('PRAGMA journal_mode=WAL');
  const columns = async (table, defs) => {
    const present = new Set((await q.all(`PRAGMA table_info(${table})`)).map(x => x.name));
    for (const [name, type] of Object.entries(defs)) if (!present.has(name)) await q.run(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
  };
  await columns('users', { session_version: 'INTEGER NOT NULL DEFAULT 0', verification_expires: 'TEXT' });
  // Older releases stored bearer tokens in plaintext without verification expiry.
  // Invalidate those links, without touching passwords, accounts or current hashed tokens.
  await q.run("UPDATE users SET reset_token=NULL,reset_token_expires=NULL WHERE reset_token IS NOT NULL AND reset_token NOT LIKE 'sha256:%'");
  await q.run("UPDATE users SET verification_token=NULL,verification_expires=NULL WHERE verification_token IS NOT NULL AND verification_token NOT LIKE 'sha256:%'");
  await columns('reports', { revision: 'INTEGER NOT NULL DEFAULT 0', sync_status: "TEXT NOT NULL DEFAULT 'legacy'" });
  await q.run('CREATE TABLE IF NOT EXISTS portal_sessions(sid TEXT PRIMARY KEY,data TEXT NOT NULL,expires INTEGER NOT NULL)');
  await q.run('CREATE INDEX IF NOT EXISTS portal_session_expiry ON portal_sessions(expires)');
  await q.run('CREATE TABLE IF NOT EXISTS security_limits(id TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL)');
  await q.run('CREATE INDEX IF NOT EXISTS security_limit_expiry ON security_limits(expires)');
  await q.run('CREATE TABLE IF NOT EXISTS report_history(id INTEGER PRIMARY KEY,report_id INTEGER NOT NULL,user_id INTEGER NOT NULL,revision INTEGER NOT NULL,reporting_month TEXT NOT NULL,data TEXT NOT NULL,recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(report_id,revision))');
  await q.run("CREATE TABLE IF NOT EXISTS sheet_jobs(kind TEXT NOT NULL,entity_id INTEGER NOT NULL,generation INTEGER NOT NULL DEFAULT 1,attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0,error TEXT NOT NULL DEFAULT '',PRIMARY KEY(kind,entity_id))");
  await q.run('CREATE TABLE IF NOT EXISTS worker_locks(name TEXT PRIMARY KEY,owner TEXT NOT NULL,expires INTEGER NOT NULL)');
  await q.run('CREATE INDEX IF NOT EXISTS reports_owner_month ON reports(user_id,reporting_month)');
  await q.run('CREATE INDEX IF NOT EXISTS users_normalized_email ON users(lower(trim(email)))');
  // Existing duplicate records are preserved; new duplicates fail atomically.
  await q.run(`CREATE TRIGGER IF NOT EXISTS users_email_guard BEFORE INSERT ON users WHEN EXISTS(SELECT 1 FROM users WHERE lower(trim(email))=lower(trim(NEW.email))) BEGIN SELECT RAISE(ABORT,'duplicate_email'); END`);
  for (const operation of ['INSERT', 'UPDATE']) {
    await q.run(`CREATE TRIGGER IF NOT EXISTS report_month_guard_${operation.toLowerCase()} BEFORE ${operation}${operation === 'UPDATE' ? ' OF reporting_month,user_id' : ''} ON reports WHEN ${operation === 'UPDATE' ? '(NEW.reporting_month!=OLD.reporting_month OR NEW.user_id!=OLD.user_id) AND ' : ''}EXISTS(SELECT 1 FROM reports WHERE user_id=NEW.user_id AND reporting_month=NEW.reporting_month AND id!=COALESCE(NEW.id,-1)) BEGIN SELECT RAISE(ABORT,'duplicate_report_month'); END`);
    await q.run(`CREATE TRIGGER IF NOT EXISTS report_capture_${operation.toLowerCase()} AFTER ${operation}${operation === 'UPDATE' ? ' OF data,reporting_month' : ''} ON reports BEGIN
      INSERT OR IGNORE INTO report_history(report_id,user_id,revision,reporting_month,data) VALUES(NEW.id,NEW.user_id,NEW.revision,NEW.reporting_month,NEW.data);
      INSERT INTO sheet_jobs(kind,entity_id) VALUES('report',NEW.id) ON CONFLICT(kind,entity_id) DO UPDATE SET generation=generation+1,attempts=0,next_attempt=0,error='';
    END`);
  }
  await q.run(`CREATE TRIGGER IF NOT EXISTS report_capture_before_edit BEFORE UPDATE OF data,reporting_month ON reports BEGIN INSERT OR IGNORE INTO report_history(report_id,user_id,revision,reporting_month,data) VALUES(OLD.id,OLD.user_id,OLD.revision,OLD.reporting_month,OLD.data); END`);
  for (const operation of ['INSERT', 'UPDATE']) await q.run(`CREATE TRIGGER IF NOT EXISTS dealer_queue_${operation.toLowerCase()} AFTER ${operation}${operation === 'UPDATE' ? ' OF name,email,mobile_number,firm_name,is_active,unsubscribe_token,terms_accepted_at,terms_version' : ''} ON users BEGIN INSERT INTO sheet_jobs(kind,entity_id) VALUES('dealer',NEW.id) ON CONFLICT(kind,entity_id) DO UPDATE SET generation=generation+1,attempts=0,next_attempt=0,error=''; END`);
  await q.run('DELETE FROM portal_sessions WHERE expires<=?', [Date.now()]);
  await q.run('DELETE FROM security_limits WHERE expires<=?', [Date.now()]);
}
function csrf(req, res, next) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  res.locals.csrfToken = req.session.csrfToken;
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.path.startsWith('/internal/bookings')) return next();
  const origin = req.get('origin');
  // Origin is an additional check; the synchronizer token is mandatory even without it.
  if ((origin && origin !== `${req.protocol}://${req.get('host')}`) || req.get('sec-fetch-site') === 'cross-site' || !safeEqual(req.body?._csrf || req.get('x-csrf-token'), req.session.csrfToken)) {
    // Finish rendering through the normal template locals, but never authenticate
    // this submission. Keep API callers on the existing JSON error contract.
    if (req.method === 'POST' && ['/login', '/register/precheck', '/register'].includes(req.path) && req.accepts(['html', 'json']) === 'html' && !req.is('application/json')) {
      if (req.path === '/login') res.locals.loginSecurityError = 'Your login form expired or could not be validated. Please enter your details again.';
      else res.locals.registrationSecurityError = 'We could not submit this form. Please enter your details again and try once more.';
      req.body = {};
      res.set('Cache-Control', 'no-store');
      return next();
    }
    return res.status(403).format({ json: () => res.json({ ok: false, message: 'Your security token expired. Refresh the page and try again.', error: 'Refresh the page and try again.' }), default: () => res.type('text').send('Your security token expired. Refresh the page and try again.') });
  }
  next();
}
function rateLimit(db, scope, maximum, milliseconds, identity = req => req.ip) {
  const q = query(db);
  return wrap(async (req, res, next) => {
    const now = Date.now(), window = Math.floor(now / milliseconds), expires = (window + 1) * milliseconds;
    const id = hashToken(`${scope}:${identity(req)}:${window}`);
    await q.run('DELETE FROM security_limits WHERE expires<=?', [now]);
    await q.run('INSERT INTO security_limits(id,count,expires) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1', [id, expires]);
    const row = await q.get('SELECT count FROM security_limits WHERE id=?', [id]);
    if (row.count > maximum) { res.set('Retry-After', String(Math.ceil((expires - now) / 1000))); return res.status(429).format({ json: () => res.json({ ok: false, error: 'Too many requests. Please try again later.', message: 'Too many requests. Please try again later.' }), default: () => res.type('text').send('Too many requests. Please try again later.') }); }
    next();
  });
}
module.exports = { query, wrap, hashToken, safeEqual, validEmail, passwordError, SQLiteSessionStore, initialize, csrf, rateLimit };
