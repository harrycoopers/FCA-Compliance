'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Read-only preflight. Never creates a database or adjusts sqlite_sequence.
async function checkProductionDatabase(file, sqlite, floor) {
  if (!file || !path.isAbsolute(file) || !fs.existsSync(file)) throw Error('Production DB_PATH must name the existing customer database on persistent storage.');
  if (!/^\d+$/.test(String(floor || '')) || !Number.isSafeInteger(Number(floor)) || Number(floor) < 1) throw Error('Set CUSTOMER_ID_FLOOR to the reconciled highest existing customer ID before launch.');
  const db = await new Promise((resolve,reject) => { const connection = new sqlite.Database(file, sqlite.OPEN_READONLY, e => e ? reject(e) : resolve(connection)); });
  const get = sql => new Promise((resolve,reject) => db.get(sql,(e,row) => e ? reject(e) : resolve(row)));
  try {
    const schema = await get("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'");
    if (!schema || !/INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/i.test(schema.sql)) throw Error('Production customer ID schema requires review.');
    // A customer-only reconstruction is not an authoritative account database.
    await get('SELECT id,password_hash,is_verified FROM users LIMIT 1');
    await get('SELECT id,user_id,data FROM reports LIMIT 1');
    const row = await get('SELECT MAX(id) AS highest FROM users');
    const sequence = await get("SELECT seq FROM sqlite_sequence WHERE name='users'");
    if (!row.highest || row.highest < Number(floor) || !sequence || sequence.seq < row.highest) throw Error('Production customer database does not meet the reconciled ID baseline; startup stopped.');
  } finally { await new Promise((resolve,reject) => db.close(e => e ? reject(e) : resolve())); }
}
module.exports = { checkProductionDatabase };
