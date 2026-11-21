'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const sqlite=require('sqlite3');
const {configureLocalDevelopment}=require('../utils/local-development');
const {openDatabase}=require('../utils/database');
const {query}=require('../utils/security');
const root=path.resolve(__dirname,'..');
const close=db=>new Promise((resolve,reject)=>db.close(e=>e?reject(e):resolve()));
function temp(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'009-local-startup-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}

test('local configuration ignores deployment secrets and cannot enable integrations',t=>{
 const dir=temp(t),production='NODE_ENV=production\nDB_PATH=/var/data/db.sqlite\nEMAIL_PASS=deployment-secret\n';
 fs.writeFileSync(path.join(dir,'.env'),production);
 fs.writeFileSync(path.join(dir,'.env.local'),'DB_PATH=custom/local.sqlite\nPORT=3210\nBOOKING_ENABLED=true\nEMAIL_PASS=must-not-load\n');
 const env={NODE_ENV:'production',DB_PATH:'/var/data/db.sqlite',EMAIL_USER:'production',EMAIL_PASS:'secret',BOOKING_API_KEY:'secret',GOOGLE_PRIVATE_KEY:'secret',SESSION_SECRET:'secret',TRUST_PROXY:'1'};
 const result=configureLocalDevelopment(dir,env);
 assert.equal(result.dbPath,path.join(dir,'custom','local.sqlite'));assert.equal(result.port,3210);
 assert.equal(env.NODE_ENV,'development');assert.equal(env.LOCAL_PREVIEW,'true');assert.equal(env.BOOKING_ENABLED,'false');assert.equal(env.BOOKING_CONFIRMATION_EMAIL_ENABLED,'false');assert.equal(env.GOOGLE_SHEETS_SYNC_ENABLED,'false');
 for(const key of ['EMAIL_PASS','EMAIL_USER','GOOGLE_PRIVATE_KEY','BOOKING_API_KEY','SESSION_SECRET','TRUST_PROXY'])assert.equal(env[key],undefined,key);
 assert.equal(fs.readFileSync(path.join(dir,'.env'),'utf8'),production);
});

test('local database creates missing directories and preserves existing data on reopening',async t=>{
 const file=path.join(temp(t),'nested','data','preview.sqlite');
 let c=openDatabase({file,production:false,sqlite});await c.ready;
 await query(c.db).run('CREATE TABLE retained(id INTEGER PRIMARY KEY,value TEXT)');
 await query(c.db).run('INSERT INTO retained VALUES(?,?)',[41,'existing data']);await close(c.db);
 c=openDatabase({file,production:false,sqlite});await c.ready;
 assert.deepEqual(await query(c.db).get('SELECT * FROM retained'),{id:41,value:'existing data'});await close(c.db);
});

test('SQLite open failure rejects cleanly and production never creates missing storage',async t=>{
 const dir=temp(t),c=openDatabase({file:dir,production:false,sqlite});
 await assert.rejects(c.ready,{code:'SQLITE_CANTOPEN'});
 const missing=path.join(dir,'production','db.sqlite');
 assert.throws(()=>openDatabase({file:missing,production:true,sqlite,customerIdFloor:'1'}),/existing customer database/);
 assert(!fs.existsSync(path.dirname(missing)));
});

test('development launcher reports open and migration failures without unhandled errors or replacing files',async t=>{
 const dir=temp(t),bad=path.join(dir,'invalid.sqlite');fs.writeFileSync(bad,'This is existing data, not SQLite.');
 for(const [file,code] of [[dir,'SQLITE_CANTOPEN'],[bad,'SQLITE_NOTADB']]){
  try{await promisify(execFile)(process.execPath,['scripts/dev-server.cjs'],{cwd:root,env:{...process.env,DEV_DB_PATH:file,DEV_PORT:'0'},timeout:15000});assert.fail('Expected startup failure');}
  catch(e){assert.equal(e.code,1);assert.match(e.stderr,new RegExp(code));assert(e.stderr.includes(file));assert.doesNotMatch(e.stderr,/Unhandled|unhandled 'error'|uncaughtException/);}
 }
 assert.equal(fs.readFileSync(bad,'utf8'),'This is existing data, not SQLite.');
});

test('development launcher identifies a busy port separately from database failures',async t=>{
 const dir=temp(t),server=require('node:net').createServer();
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {
  await assert.rejects(promisify(execFile)(process.execPath,['scripts/dev-server.cjs'],{cwd:root,env:{...process.env,DEV_DB_PATH:path.join(dir,'db.sqlite'),DEV_PORT:String(server.address().port)},timeout:15000}),e=>{
   assert.equal(e.code,1);assert.match(e.stderr,/Local port \d+ is unavailable/);assert.doesNotMatch(e.stderr,/Unhandled|unhandled 'error'/);return true;
  });
 } finally {await new Promise(resolve=>server.close(resolve));}
});

test('local startup runs normal migrations, serves guides and blocks bookings and outbound mail',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'009-local-startup-'));
 const file=path.join(dir,'preview','db.sqlite');
 process.env.DEV_DB_PATH=file;process.env.DEV_PORT='0';
 configureLocalDevelopment(root);
 const app=require('../server');t.after(async()=>{await app.locals.close();fs.rmSync(dir,{recursive:true,force:true});});
 const server=await app.locals.start(),base='http://127.0.0.1:'+server.address().port;
 assert.equal(server.address().address,'127.0.0.1');
 const q=query(app.locals.db),tables=(await q.all("SELECT name FROM sqlite_master WHERE type='table'")).map(r=>r.name);
 for(const table of ['users','reports','portal_sessions','report_history','sheet_jobs','meeting_bookings','booking_blocks'])assert(tables.includes(table),table);
 const guide=await fetch(base+'/do-motor-dealers-need-fca-authorisation');assert.equal(guide.status,200);const html=await guide.text();
 assert(html.includes('Do Car Dealers Need FCA Authorisation to Offer Finance?'));assert(html.includes('£600'));assert(html.includes('FCA application fee payable separately'));
 const status=await app.locals.bookings.status();assert.equal(status.configured,false);assert.equal(status.confirmationEmailEnabled,false);assert.equal(app.locals.sheetsSync.configured(),false);
 assert.equal((await fetch(base+'/api/bookings/availability?date=2026-11-20')).status,503);
 // Exercise the denial with a valid local CSRF token, but no real booking data.
 const token=html.match(/name="csrf-token" content="([^"]+)"/)[1];
 const cookie=guide.headers.get('set-cookie').split(';')[0];
 const post=await fetch(base+'/api/bookings',{method:'POST',headers:{cookie,origin:base,'x-csrf-token':token,'content-type':'application/json'},body:'{}'});
 assert.equal(post.status,503);assert.match(await post.text(),/disabled in this local preview/);
 assert.equal((await q.get('SELECT count(*) AS n FROM meeting_bookings')).n,0);
 await assert.rejects(require('../utils/email').sendEmail({to:'nobody@example.invalid',subject:'test',html:'test'}),/disabled in the local preview/);
});
