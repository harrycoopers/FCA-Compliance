'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const sqlite=require('sqlite3'),{query,initialize}=require('../utils/security');
const {checkProductionDatabase}=require('../utils/customer-database');
const {createSheetsSync}=require('../utils/sheets-sync');
const close=db=>new Promise((resolve,reject)=>db.close(e=>e?reject(e):resolve()));
test('persistent allocation and Sheets identity safeguards use isolated fixtures',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'009-id-safety-')),file=path.join(dir,'customer.sqlite');let db=new sqlite.Database(file),q=query(db),sync;
 try{
  await q.run('CREATE TABLE users(id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT,password_hash TEXT,name TEXT,mobile_number TEXT,firm_name TEXT,is_active INTEGER,created_at TEXT,unsubscribe_token TEXT,terms_accepted_at TEXT,terms_version TEXT,is_verified INTEGER,reset_token TEXT,reset_token_expires TEXT,verification_token TEXT)');
  await q.run('CREATE TABLE reports(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,reporting_month TEXT,data TEXT,created_at TEXT,updated_at TEXT)');
  await initialize(db);
  await q.run("INSERT INTO users(id,email,password_hash,name,is_verified) VALUES(31,'existing@example.invalid','unchanged-hash','Existing',1)");
  await t.test('missing, empty and mismatched production databases fail without creating or resetting data',async()=>{
   const missing=path.join(dir,'missing.sqlite');await assert.rejects(checkProductionDatabase(missing,sqlite,'31'));assert(!fs.existsSync(missing));
   await assert.rejects(checkProductionDatabase(file,sqlite,'32'));await assert.rejects(checkProductionDatabase(file,sqlite,undefined));await checkProductionDatabase(file,sqlite,'31');
   const blank=path.join(dir,'blank.sqlite'),empty=new sqlite.Database(blank);await close(empty);await assert.rejects(checkProductionDatabase(blank,sqlite,'31'));assert.equal(fs.statSync(blank).size,0);
  });
  await t.test('31 allocates 32, then reopening the same storage allocates 33',async()=>{
   assert.equal((await q.run("INSERT INTO users(email,name) VALUES('next@example.invalid','Next')")).id,32);
   await close(db);db=new sqlite.Database(file,sqlite.OPEN_READWRITE);q=query(db);await checkProductionDatabase(file,sqlite,'31');await initialize(db);
   assert.equal((await q.run("INSERT INTO users(email,name) VALUES('after-restart@example.invalid','After restart')")).id,33);
   assert.deepEqual(await q.get('SELECT password_hash,is_verified FROM users WHERE id=31'),{password_hash:'unchanged-hash',is_verified:1});
  });
  const tables={Dealers:[['31','Existing','existing@example.invalid']],Submissions:[]},writes=[];
  const values={get:async({range,spreadsheetId})=>{assert.equal(spreadsheetId,'isolated-test');return {data:{values:structuredClone(tables[range.split('!')[0]])}};},update:async x=>writes.push(x),append:async x=>writes.push(x)};
  const google={auth:{JWT:class{}},sheets:()=>({spreadsheets:{values}})};
  const env={NODE_ENV:'development',GOOGLE_SERVICE_ACCOUNT_EMAIL:'mock',GOOGLE_PRIVATE_KEY:'mock',GOOGLE_SHEETS_SPREADSHEET_ID:'production',GOOGLE_SHEETS_TEST_SPREADSHEET_ID:'isolated-test',GOOGLE_SHEETS_TEST_SYNC_ENABLED:'true'};
  sync=createSheetsSync({db,google,ready:Promise.resolve(),env});
  await t.test('development is disabled by default and cannot target the configured production sheet',async()=>{
   delete env.GOOGLE_SHEETS_TEST_SYNC_ENABLED;assert.equal(sync.configured(),false);await sync.flush();assert.equal(writes.length,0);
   env.GOOGLE_SHEETS_TEST_SYNC_ENABLED='true';env.GOOGLE_SHEETS_TEST_SPREADSHEET_ID='production';assert.equal(sync.configured(),false);env.GOOGLE_SHEETS_TEST_SPREADSHEET_ID='isolated-test';assert.equal(sync.configured(),true);
  });
  async function dealerConflict(rows){tables.Dealers=rows;writes.length=0;await q.run("DELETE FROM sheet_jobs");await q.run("INSERT INTO sheet_jobs(kind,entity_id) VALUES('dealer',31)");await sync.flush();assert.equal(writes.length,0);assert.equal((await q.get('SELECT error FROM sheet_jobs')).error,'sheet_identity_conflict');}
  await t.test('numeric collisions, missing DB customers, duplicate IDs and duplicate emails stop all writes',async()=>{
   await dealerConflict([['31','Wrong','different@example.invalid']]);
   await dealerConflict([['34','Missing','missing@example.invalid']]);
   await dealerConflict([['31','Existing','existing@example.invalid'],['31','Existing','existing@example.invalid']]);
   await dealerConflict([['31','Existing','existing@example.invalid'],['32','Wrong','existing@example.invalid']]);
  });
  await t.test('report collision also checks customer email and reporting month',async()=>{
   tables.Dealers=[['31','Existing','existing@example.invalid']];await q.run('DELETE FROM sheet_jobs');
   await q.run("INSERT INTO reports(id,user_id,reporting_month,data) VALUES(31,31,'2026-10','{}')");
   for(const row of [['31','31','Wrong','different@example.invalid','','2026-10'],['31','31','Existing','existing@example.invalid','','2026-09']]){
    tables.Submissions=[row];writes.length=0;await q.run('UPDATE sheet_jobs SET next_attempt=0');await sync.flush();assert.equal(writes.length,0);assert.equal((await q.get('SELECT error FROM sheet_jobs')).error,'sheet_identity_conflict');
   }
  });
 }finally{if(sync)await sync.stop();await close(db);fs.rmSync(dir,{recursive:true,force:true});}
});
