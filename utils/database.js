'use strict';
const fs = require('node:fs');
const path = require('node:path');

function openDatabase({ file, production, sqlite, customerIdFloor }) {
  const resolved = file === ':memory:' ? file : path.resolve(file);
  // Production retains its existing-file requirement; never create its storage.
  if (production && (!file || !path.isAbsolute(file) || !fs.existsSync(file))) {
    throw Error('Production DB_PATH must name the existing customer database on persistent storage.');
  }
  if (!production && file !== ':memory:') fs.mkdirSync(path.dirname(resolved), { recursive: true });
  let db;
  const opened = new Promise((resolve, reject) => {
    // Supplying the callback is essential: an open failure otherwise emits an
    // unhandled SQLite error before the migration promise can report it.
    db = new sqlite.Database(resolved, production ? sqlite.OPEN_READWRITE : sqlite.OPEN_READWRITE | sqlite.OPEN_CREATE,
      error => error ? reject(error) : resolve());
  });
  const ready = opened.then(() => production
    ? require('./customer-database').checkProductionDatabase(resolved, sqlite, customerIdFloor)
    : undefined);
  return { db, path: resolved, ready };
}
module.exports = { openDatabase };
