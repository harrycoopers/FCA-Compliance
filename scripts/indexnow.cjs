'use strict';
const fs = require('node:fs');
const path = require('node:path');
const pages = require('../config/seo-pages.json');
const origin = 'https://009compliance.com';
const keyFile = '36341005a716865fb5c566c8d7418ce1.txt';

async function submit(args) {
  const dryRun = args.includes('--dry-run');
  const paths = [...new Set(args.filter(arg => arg !== '--dry-run'))];
  if (!paths.length || paths.some(route => !Object.hasOwn(pages, route))) {
    throw new Error('Supply the changed public page paths, e.g. node scripts/indexnow.cjs /guides /about');
  }
  const key = fs.readFileSync(path.join(__dirname, '../public', keyFile), 'utf8').trim();
  if (keyFile !== key + '.txt') throw new Error('The key file name and contents differ.');
  const payload = { host: new URL(origin).hostname, key, keyLocation: origin + '/' + keyFile, urlList: paths.map(route => origin + route) };
  if (dryRun) {
    console.log(payload.urlList.join('\n'));
    return;
  }
  const keyResponse = await fetch(payload.keyLocation, { redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!keyResponse.ok || (await keyResponse.text()).trim() !== key) throw new Error('The production key file is not ready.');
  const response = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error('IndexNow returned HTTP ' + response.status);
  console.log('IndexNow received ' + paths.length + ' URL(s), HTTP ' + response.status + '.');
}
submit(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
