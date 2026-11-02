'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module');
const sqlite=require('sqlite3'),bcrypt=require('bcrypt'),{query,SQLiteSessionStore}=require('../utils/security');
const legacyHash='$2b$10$9V3pcubZTJrI9//RWHpi0.X19eJ3X4T5Z8wIKzLsZOm/lmP6JbdeC';
const terms='009/13-2026-11-01-revision-2026-10-29';
const months=Array.from({length:20},(_,i)=>{const d=new Date();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-i);return d.toISOString().slice(0,7);});
test('security and backend regression suite (isolated SQLite, no external services)',async t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'009-security-')),dbPath=path.join(temp,'test.sqlite');
 const tables={Dealers:[['DealerID','Name','Email','Phone','Firm','Active','Created']],Submissions:[['ReportID','DealerID']]},calls=[],mail=[];
 let failWrites=false,failAfterWrite=false;
 const column=s=>[...s].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1;
 const values={
  async get(a){const [sheet,range]=a.range.split('!');const start=range.match(/^[A-Z]+(\d+)/);const rows=tables[sheet].slice(start?Number(start[1])-1:0);const cols=column((range.match(/:([A-Z]+)/)||[])[1]||'A')+1;return {data:{values:rows.map(r=>r.slice(0,cols))}};},
  async append(a){calls.push({method:'append',...a});if(failWrites)throw Error('mock failure');tables[a.range.split('!')[0]].push([...a.requestBody.values[0]]);if(failAfterWrite){failAfterWrite=false;throw Error('ambiguous transport response');}return {};},
  async update(a){calls.push({method:'update',...a});if(failWrites)throw Error('mock failure');const [sheet,range]=a.range.split('!'),match=range.match(/^([A-Z]+)(\d+)/),row=Number(match[2])-1,start=column(match[1]);tables[sheet][row]||=[];a.requestBody.values[0].forEach((v,i)=>tables[sheet][row][start+i]=v);return {};}
 };
 const google={auth:{JWT:class{}},sheets:()=>({spreadsheets:{values}})};
 const oldEnv={...process.env};for(const key of Object.keys(process.env))if(/^(GOOGLE_|EMAIL_|SMTP_|BOOKING_|DB_PATH|SESSION_SECRET|BASE_URL|NODE_ENV|TRUST_PROXY)/.test(key))delete process.env[key];
 Object.assign(process.env,{NODE_ENV:'test',DB_PATH:dbPath,SESSION_SECRET:'isolated-tests-not-a-production-secret-123456',BASE_URL:'http://localhost:3000',GOOGLE_SERVICE_ACCOUNT_EMAIL:'mock@example.invalid',GOOGLE_PRIVATE_KEY:'mock',GOOGLE_SHEETS_SPREADSHEET_ID:'production-must-not-be-used',GOOGLE_SHEETS_TEST_SPREADSHEET_ID:'mock',GOOGLE_SHEETS_TEST_SYNC_ENABLED:'true'});
 // A pre-security database: legacy account/hash, duplicate reports and plaintext old links.
 const originalDb=new sqlite.Database(dbPath),oldQ=query(originalDb);
 await oldQ.run('CREATE TABLE users(id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,name TEXT NOT NULL,mobile_number TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,is_verified INTEGER DEFAULT 0,verification_token TEXT,reset_token TEXT,reset_token_expires TEXT)');
 await oldQ.run('CREATE TABLE reports(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,reporting_month TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,data TEXT NOT NULL)');
 await oldQ.run('INSERT INTO users(email,password_hash,name,is_verified,reset_token,verification_token) VALUES(?,?,?,?,?,?)',['legacy@example.invalid',legacyHash,'Legacy client',1,'old-reset-token','old-verify-token']);
 for(let i=0;i<2;i++)await oldQ.run('INSERT INTO reports(user_id,reporting_month,data) VALUES(1,?,?)',[months[10],'{"total_vehicles_sold":"5"}']);
 await new Promise((r,j)=>originalDb.close(e=>e?j(e):r()));
 const load=Module._load;
 Module._load=function(id,parent){if(id==='dotenv')return {config:()=>({})};if(id==='googleapis')return {google};if(id==='./utils/email'&&path.basename(parent.filename)==='server.js')return {sendEmail:async item=>{mail.push(item)}};return load.apply(this,arguments);};
 let app;try{app=require('../server');}finally{Module._load=load;}
 await app.locals.databaseReady;const db=app.locals.db,q=query(db),sync=app.locals.sheetsSync;
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const jar=()=>({cookie:'',csrf:''});
 async function request(agent,url,options={}){const response=await fetch(base+url,{redirect:'manual',...options,headers:{cookie:agent.cookie,...options.headers}});const cookie=response.headers.get('set-cookie');if(cookie)agent.cookie=cookie.split(';')[0];const text=await response.text();const token=text.match(/name="csrf-token" content="([a-f0-9]+)"/);if(token)agent.csrf=token[1];return {status:response.status,text,headers:response.headers,location:response.headers.get('location')};}
 const get=(a,u)=>request(a,u);
 const post=(a,u,data={},headers={})=>request(a,u,{method:'POST',headers:{origin:base,'sec-fetch-site':'same-origin','content-type':'application/x-www-form-urlencoded',...headers},body:new URLSearchParams({_csrf:a.csrf,...data})});
 async function login(email='a@example.invalid',password='Existing-password-123'){const a=jar();await get(a,'/login');const r=await post(a,'/login',{email,password});assert.equal(r.status,302);assert.equal(r.location,'/dashboard');await get(a,'/dashboard');return a;}
 const body=(month,extra={})=>({reporting_month:month,confirm_submission:'yes',total_vehicles_sold:'12',funded_deals:'3',finance_commission:'£1,250.50',...extra});
 const caseTest=(name,fn)=>t.test(name,async()=>{await q.run('DELETE FROM security_limits');await fn();});
 let a,b,owned,other;
 try {
  await caseTest('existing accounts, hashes and duplicate historic reports survive migration',async()=>{
   const user=await q.get('SELECT * FROM users WHERE id=1');assert.equal(user.password_hash,legacyHash);assert.equal(user.reset_token,null);assert.equal(user.verification_token,null);assert(await bcrypt.compare('Legacy-password-123',user.password_hash));assert.equal((await q.get('SELECT count(*) n FROM reports WHERE user_id=1')).n,2);
   await q.run('UPDATE users SET terms_version=? WHERE id=1',[terms]);const legacy=await login('legacy@example.invalid','Legacy-password-123');const r=await post(legacy,'/reports/1/edit',body(months[10],{revision:'0'}));assert.equal(r.status,302);assert.equal((await q.get('SELECT count(*) n FROM reports WHERE user_id=1')).n,2);
  });
  await caseTest('existing ID 31 is preserved and concurrent registrations allocate 32 onward',async()=>{
   await q.run('INSERT INTO users(id,email,password_hash,name,is_verified) VALUES(31,?,?,?,1)',['existing31@example.invalid',legacyHash,'Existing customer']);
   const original=await q.get('SELECT * FROM users WHERE id=31');
   async function register(suffix){const visitor=jar();await get(visitor,'/register');const data={firm_name:'ID fixture',fca_firm_ref:'123456',name:'Isolated customer',email:`allocation${suffix}@example.invalid`,mobile_number:'07000000000',password:'Isolated-registration-password-123',confirmPassword:'Isolated-registration-password-123'};assert.equal((await post(visitor,'/register/precheck',data)).location,'/terms');await get(visitor,'/terms');assert.equal((await post(visitor,'/register',{agree_terms:'yes'})).location,'/verify-email-notice');return (await q.get('SELECT id FROM users WHERE email=?',[data.email])).id;}
   assert.equal(await register('first'),32);
   const ids=await Promise.all([register('parallel-a'),register('parallel-b')]);assert.deepEqual(ids.sort((a,b)=>a-b),[33,34]);
   assert.deepEqual(await q.get('SELECT * FROM users WHERE id=31'),original);
  });
  const hash=await bcrypt.hash('Existing-password-123',4);
  for(const [email,name,unsub] of [['a@example.invalid','Dealer A','a'.repeat(48)],['b@example.invalid','Dealer B','b'.repeat(48)]])await q.run('INSERT INTO users(email,password_hash,name,firm_name,mobile_number,is_verified,terms_version,terms_accepted_at,unsubscribe_token) VALUES(?,?,?,?,?,1,?,?,?)',[email,hash,name,name+' Ltd','07000000000',terms,'original-terms-date',unsub]);
  a=await login();b=await login('b@example.invalid');await sync.flush(100);calls.length=0;
  const userA=await q.get('SELECT * FROM users WHERE email=?',['a@example.invalid']),userB=await q.get('SELECT * FROM users WHERE email=?',['b@example.invalid']);
  await caseTest('all 33 public pages render with security tokens and security headers',async()=>{
   const visitor=jar();for(const url of Object.keys(require('../config/seo-pages.json'))){const r=await get(visitor,url);assert.equal(r.status,200,url);assert.equal((r.text.match(/<h1\b/g)||[]).length,1,url);assert.match(r.text,/name="csrf-token" content="[a-f0-9]{64}"/);assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.equal(r.headers.get('referrer-policy'),'same-origin');}
  });
  await caseTest('login rejection renders a fresh form without replaying credentials',async()=>{
   for(const headers of [{},{origin:'https://foreign.invalid'},{'sec-fetch-site':'cross-site'}]) {
    const visitor=jar();await get(visitor,'/login');
    const r=await post(visitor,'/login',{_csrf:'expired',email:'a@example.invalid',password:'Existing-password-123'},{accept:'text/html',...headers});
    assert.equal(r.status,403);assert.match(r.text,/login form expired/);assert.match(r.text,/name="_csrf"/);assert(!r.text.includes('Existing-password-123'));assert.match(r.headers.get('cache-control'),/no-store/);
    assert.equal((await get(visitor,'/dashboard')).location,'/login');
    const retry=await post(visitor,'/login',{email:'a@example.invalid',password:'Existing-password-123'});assert.equal(retry.location,'/dashboard');
   }
   const visitor=jar();await get(visitor,'/login');const oldToken=visitor.csrf;visitor.cookie='';
   const expired=await post(visitor,'/login',{_csrf:oldToken},{accept:'text/html'});assert.equal(expired.status,403);assert.notEqual(visitor.csrf,oldToken);
   const api=await post(visitor,'/login',{_csrf:'bad'},{accept:'application/json'});assert.equal(api.status,403);assert.equal(JSON.parse(api.text).ok,false);
  });
  await caseTest('CSRF rejects missing, forged, multibyte and foreign-origin tokens',async()=>{
   for(const [token,headers] of [['',{}],['bad',{}],['é'.repeat(64),{}],[a.csrf,{origin:'https://foreign.invalid'}]]){const r=await post(a,'/reports/new',body(months[0],{_csrf:token}),headers);assert.equal(r.status,403);}
   assert.equal((await q.get('SELECT count(*) n FROM reports WHERE user_id=?',[userA.id])).n,0);
  });
  await caseTest('valid reports synchronize as RAW literal input and retain history',async()=>{
   const r=await post(a,'/reports/new',body(months[0],{lenders_brokers_used:'=IMPORTXML("https://example.invalid","//a")'}));assert.equal(r.status,302);
   owned=await q.get('SELECT * FROM reports WHERE user_id=?',[userA.id]);assert.equal(owned.sync_status,'synced');const row=tables.Submissions.find(r=>String(r[0])===String(owned.id));assert.equal(row[1],String(userA.id));assert.equal(row[4],'07000000000');assert.equal(row[10],'1250.50');assert(row.includes('=IMPORTXML("https://example.invalid","//a")'));assert(calls.every(c=>c.valueInputOption==='RAW'));assert.equal((await q.get('SELECT count(*) n FROM report_history WHERE report_id=?',[owned.id])).n,1);
   assert.equal((await post(b,'/reports/new',body(months[0],{total_vehicles_sold:'25'}))).status,302);other=await q.get('SELECT * FROM reports WHERE user_id=?',[userB.id]);
  });
  await caseTest('cross-account GET and POST cannot write database, Sheets or queue',async()=>{
   const before=JSON.stringify(tables),jobs=await q.all('SELECT * FROM sheet_jobs'),count=calls.length;
   assert.equal((await get(a,`/reports/${other.id}/edit`)).status,404);
   assert.equal((await post(a,`/reports/${other.id}/edit`,body(months[0],{revision:'0',total_vehicles_sold:'999'}))).status,404);
   assert.equal((await q.get('SELECT data FROM reports WHERE id=?',[other.id])).data,other.data);assert.equal(JSON.stringify(tables),before);assert.equal(calls.length,count);assert.deepEqual(await q.all('SELECT * FROM sheet_jobs'),jobs);
  });
  await caseTest('owner edit checks declaration and rejects stale concurrent revision',async()=>{
   const url=`/reports/${owned.id}/edit`;
   assert.equal((await post(a,url,body(months[0],{revision:'0',confirm_submission:''}))).status,400);
   assert.equal((await post(a,url,body(months[0],{revision:'0',total_vehicles_sold:'14'}))).status,302);
   const count=calls.length;assert.equal((await post(a,url,body(months[0],{revision:'0',total_vehicles_sold:'99'}))).status,409);assert.equal(calls.length,count);
   assert.equal(JSON.parse((await q.get('SELECT data FROM reports WHERE id=?',[owned.id])).data).total_vehicles_sold,'14');assert.equal((await q.get('SELECT count(*) n FROM report_history WHERE report_id=?',[owned.id])).n,2);
  });
  await caseTest('invalid amounts, counts, months and excessive input never reach Sheets',async()=>{
   const count=calls.length;
   for(const patch of [{reporting_month:'not-a-month'},{reporting_month:'2026-13'},{total_vehicles_sold:'-1'},{funded_deals:'1.5'},{finance_commission:'=1+1'},{finance_commission:'NaN'},{finance_commission:'1,23'},{changes_details:'x'.repeat(5001)},{finance_complaints:'malformed'}])assert.equal((await post(a,'/reports/new',body(months[1],patch))).status,400,JSON.stringify(patch).slice(0,60));
   assert.equal(calls.length,count);
   const typed=await request(a,'/reports/new',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':a.csrf},body:JSON.stringify(body(months[1],{total_vehicles_sold:['10','20']}))});assert.equal(typed.status,400);
  });
  await caseTest('duplicate month guard remains atomic under simultaneous submissions',async()=>{
   const responses=await Promise.all([post(a,'/reports/new',body(months[1])),post(a,'/reports/new',body(months[1]))]);assert.deepEqual(responses.map(x=>x.status).sort(),[302,409]);assert.equal((await q.get('SELECT count(*) n FROM reports WHERE user_id=? AND reporting_month=?',[userA.id,months[1]])).n,1);
  });
  await caseTest('ambiguous Sheets response retries without duplicating the appended report',async()=>{
   failAfterWrite=true;const r=await post(a,'/reports/new',body(months[2]));assert.equal(r.status,302);const row=await q.get('SELECT * FROM reports WHERE user_id=? AND reporting_month=?',[userA.id,months[2]]);assert.equal(row.sync_status,'pending');assert(await q.get("SELECT * FROM sheet_jobs WHERE kind='report' AND entity_id=?",[row.id]));
   await q.run('UPDATE sheet_jobs SET next_attempt=0');await sync.flush(100);assert.equal(tables.Submissions.filter(x=>String(x[0])===String(row.id)).length,1);assert.equal((await q.get('SELECT sync_status FROM reports WHERE id=?',[row.id])).sync_status,'synced');
  });
  await caseTest('Sheets owner-ID conflict fails closed instead of overwriting another dealer',async()=>{
   const sheetRow=tables.Submissions.find(x=>String(x[0])===String(owned.id));sheetRow[1]=String(userB.id);const before=[...sheetRow];
   await q.run("UPDATE reports SET data=data,revision=revision+1,sync_status='pending' WHERE id=?",[owned.id]);await sync.flush(100);
   assert.deepEqual(sheetRow,before);assert.equal((await q.get("SELECT error FROM sheet_jobs WHERE kind='report' AND entity_id=?",[owned.id])).error,'sheet_identity_conflict');
   sheetRow[1]=String(userA.id);await q.run('UPDATE sheet_jobs SET next_attempt=0');await sync.flush(100);
  });
  await caseTest('unconfigured integration preserves saved data and durable retry work',async()=>{
   const configured=process.env.GOOGLE_SHEETS_TEST_SPREADSHEET_ID;delete process.env.GOOGLE_SHEETS_TEST_SPREADSHEET_ID;
   try{assert.equal((await post(a,'/reports/new',body(months[3]))).status,302);assert(await q.get("SELECT * FROM sheet_jobs WHERE kind='report'"));}finally{process.env.GOOGLE_SHEETS_TEST_SPREADSHEET_ID=configured;}
   await sync.flush(100);assert.equal((await q.get('SELECT sync_status FROM reports WHERE user_id=? AND reporting_month=?',[userA.id,months[3]])).sync_status,'synced');
  });
  await caseTest('unsubscribe GET is read-only; POST preserves firm, creation and agreement metadata',async()=>{
   const visitor=jar(),url='/unsubscribe?token='+'a'.repeat(48);const original=await q.get('SELECT * FROM users WHERE id=?',[userA.id]);const sheet=tables.Dealers.find(x=>String(x[0])===String(userA.id));sheet[6]='original-sheet-created';sheet[7]='ADMIN KEEP';
   assert.equal((await get(visitor,url)).status,200);assert.equal((await q.get('SELECT is_active FROM users WHERE id=?',[userA.id])).is_active,1);
   assert.equal((await post(visitor,'/unsubscribe',{token:'a'.repeat(48)})).status,200);await sync.flush(100);
   const after=await q.get('SELECT * FROM users WHERE id=?',[userA.id]);assert.equal(after.is_active,0);for(const key of ['firm_name','terms_version','terms_accepted_at','created_at'])assert.equal(after[key],original[key]);assert.equal(sheet[4],original.firm_name);assert.equal(sheet[5],'FALSE');assert.equal(sheet[6],'original-sheet-created');assert.equal(sheet[7],'ADMIN KEEP');assert.equal(sheet[15],original.terms_accepted_at);
   assert.equal((await post(a,'/terms/accept',{agree_terms:'yes'})).status,302);await sync.flush(100);assert.equal((await q.get('SELECT is_active FROM users WHERE id=?',[userA.id])).is_active,0);assert.equal(sheet[5],'FALSE');assert.equal(sheet[6],'original-sheet-created');
  });
  await caseTest('native registration forms retain their origin and rejected submissions stay styled',async()=>{
   const visitor=jar(),page=await get(visitor,'/register');
   assert.equal(page.headers.get('referrer-policy'),'same-origin');
   assert.equal(page.text.match(/name="_csrf" value="([^"]+)"/)[1],visitor.csrf);
   const before=await q.get('SELECT count(*) n FROM users');
   for(const url of ['/register/precheck','/register']) {
    for(const headers of [{origin:'null'},{origin:'https://foreign.invalid'},{'sec-fetch-site':'cross-site'}]) {
     const r=await post(visitor,url,{password:'Never-echo-this-password'},{accept:'text/html',...headers});
     assert.equal(r.status,403);assert.match(r.text,/auth-page register-page/);assert.match(r.text,/We could not submit this form/);
     assert(!r.text.includes('Never-echo-this-password'));assert.match(r.text,/name="_csrf"/);assert.match(r.headers.get('cache-control'),/no-store/);
    }
    const missing=await post(visitor,url,{_csrf:''},{accept:'text/html'});assert.equal(missing.status,403);assert.match(missing.text,/auth-page register-page/);
    const api=await post(visitor,url,{_csrf:'invalid'},{accept:'application/json'});assert.equal(api.status,403);assert.equal(JSON.parse(api.text).ok,false);
   }
   const oldToken=visitor.csrf;visitor.cookie='';
   const expired=await post(visitor,'/register/precheck',{_csrf:oldToken},{accept:'text/html'});assert.equal(expired.status,403);assert.notEqual(visitor.csrf,oldToken);
   assert.equal((await q.get('SELECT count(*) n FROM users')).n,before.n);
   assert.equal((await post(visitor,'/register/precheck')).status,400); // Fresh token reaches field validation.
  });
  await caseTest('registration hashes pending passwords, verifies email, and prevents unverified access',async()=>{
   const visitor=jar();await get(visitor,'/register');const data={firm_name:'New Dealer',fca_firm_ref:'123456',name:'<b>New Client</b>',email:'new@example.invalid',mobile_number:'07000000000',password:'New-secure-password-123',confirmPassword:'New-secure-password-123'};
   assert.equal((await post(visitor,'/register/precheck',{...data,password:'x',confirmPassword:'x'})).status,400);
   assert.equal((await post(visitor,'/register/precheck',data)).location,'/terms');const page=await get(visitor,'/terms');assert(!page.text.includes(data.password));const pending=await q.all('SELECT data FROM portal_sessions');assert(!pending.some(x=>x.data.includes(data.password)));assert(pending.some(x=>JSON.parse(x.data).pendingPasswordHash));
   assert.equal((await post(visitor,'/register',{agree_terms:'yes'})).location,'/verify-email-notice');const user=await q.get('SELECT * FROM users WHERE email=?',[data.email]);assert.equal(user.is_verified,0);assert.equal(bcrypt.getRounds(user.password_hash),12);assert.equal((await get(visitor,'/dashboard')).location,'/login');
   const token=mail.findLast(x=>x.to===data.email).html.match(/verify-email\?token=([a-f0-9]+)/)[1];assert.notEqual(user.verification_token,token);assert(mail.at(-1).html.includes('&lt;b&gt;New Client&lt;/b&gt;'));
   await get(visitor,'/verify-email?token='+token);assert.equal((await q.get('SELECT is_verified FROM users WHERE id=?',[user.id])).is_verified,1);const verified=await login(data.email,data.password);assert.equal((await get(verified,'/dashboard')).status,200);
  });
  await caseTest('legacy unverified login cannot bypass verification',async()=>{
   await q.run('INSERT INTO users(email,password_hash,name,is_verified,terms_version) VALUES(?,?,?,0,?)',['unverified@example.invalid',hash,'Unverified',terms]);const visitor=jar();await get(visitor,'/login');const r=await post(visitor,'/login',{email:'unverified@example.invalid',password:'Existing-password-123'});assert.equal(r.location,'/verify-email-notice');assert.equal((await get(visitor,'/reports')).location,'/login');
  });
  await caseTest('reset pages exclude analytics; reset is single-use and revokes old sessions',async()=>{
   const visitor=jar();await get(visitor,'/forgot-password');await post(visitor,'/forgot-password',{email:'a@example.invalid'});const token=mail.findLast(x=>x.to==='a@example.invalid').html.match(/reset-password\/([a-f0-9]+)/)[1];const resetPage=await get(visitor,'/reset-password/'+token);assert.equal(resetPage.status,200);assert(!resetPage.text.includes('googletagmanager'));assert.match(resetPage.headers.get('cache-control'),/no-store/);assert.equal(resetPage.headers.get('referrer-policy'),'same-origin');
   assert.equal((await post(visitor,'/reset-password/'+token,{password:'x',confirmPassword:'x'})).status,400);
   assert.equal((await post(visitor,'/reset-password/'+token,{password:'Replacement-password-123',confirmPassword:'Replacement-password-123'})).location,'/login');
   assert.equal((await get(a,'/dashboard')).location,'/login');assert.equal((await get(visitor,'/reset-password/'+token)).location,'/forgot-password');assert.equal((await q.get('SELECT reset_token FROM users WHERE id=?',[userA.id])).reset_token,null);a=await login('a@example.invalid','Replacement-password-123');
  });
  await caseTest('private pages exclude analytics and persistent sessions contain no readable password',async()=>{
   const response=await get(a,'/dashboard');assert(!response.text.includes('googletagmanager'));assert.match(response.headers.get('cache-control'),/no-store/);const cookie=response.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Lax/);
   const sid=decodeURIComponent(a.cookie.split('=').slice(1).join('=')).slice(2).split('.')[0],store=new SQLiteSessionStore(db,Promise.resolve());try{const session=await new Promise((r,j)=>store.get(sid,(e,x)=>e?j(e):r(x)));assert.equal(session.user.id,userA.id);assert(!session.pendingPassword);assert(!JSON.stringify(session).includes('Replacement-password-123'));}finally{store.close();}
  });
  await caseTest('contact validates email and escapes HTML while blocking forged submissions',async()=>{
   const visitor=jar();await get(visitor,'/contact');const input={first_name:'<b>A</b>',last_name:'Client',phone_number:'07000000000',company_name:'Test',email:'test@example.invalid',message:'<script>test</script>'};const count=mail.length;
   assert.equal((await post(visitor,'/contact',{...input,email:'bad\r\nBcc:other@invalid'},{accept:'application/json'})).status,400);assert.equal(mail.length,count);
   assert.equal((await post(visitor,'/contact',input,{accept:'application/json',origin:'https://foreign.invalid'})).status,403);
   assert.equal((await post(visitor,'/contact',input,{accept:'application/json'})).status,200);assert(mail.at(-1).html.includes('&lt;script&gt;test&lt;/script&gt;'));
  });
  await caseTest('logout GET does not end session; authenticated POST does',async()=>{
   assert.equal((await get(b,'/logout')).status,200);assert.equal((await get(b,'/dashboard')).status,200);assert.equal((await post(b,'/logout')).status,302);assert.equal((await get(b,'/dashboard')).location,'/login');
  });
  await caseTest('login throttling survives new cookies and returns Retry-After',async()=>{
   for(let i=0;i<20;i++){const visitor=jar();await get(visitor,'/login');assert.equal((await post(visitor,'/login',{email:'missing@example.invalid',password:'wrong'})).status,302);}
   const visitor=jar();await get(visitor,'/login');const r=await post(visitor,'/login',{email:'missing@example.invalid',password:'wrong'});assert.equal(r.status,429);assert(Number(r.headers.get('retry-after'))>0);
  });
  await caseTest('unknown routes and malformed bodies fail safely without stack disclosure',async()=>{
   assert.equal((await get(jar(),'/missing-audit-page')).status,404);const bad=await request(jar(),'/contact',{method:'POST',headers:{'content-type':'application/json'},body:'{' });assert.equal(bad.status,400);assert(!bad.text.includes('SyntaxError'));
  });
  await caseTest('native report selectors work without JavaScript; malformed enquiry objects are rejected',async()=>{
   const r=await post(a,'/reports/new',{report_year:months[4].slice(0,4),report_month:months[4].slice(5),confirm_submission:'yes',total_vehicles_sold:'2'});assert.equal(r.status,302);
   const visitor=jar();await get(visitor,'/contact');const bad=await request(visitor,'/contact',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':visitor.csrf},body:JSON.stringify({first_name:{toString:null}})});assert.equal(bad.status,400);assert.equal((await get(visitor,'/')).status,200);
  });
  await caseTest('migrations are idempotent and do not remove current tokens or customer records',async()=>{
   const before=(await q.get('SELECT count(*) n FROM reports')).n;
   await q.run("UPDATE users SET reset_token=?,reset_token_expires=? WHERE id=?",['sha256:'+'a'.repeat(64),new Date(Date.now()+3600000).toISOString(),userA.id]);
   await require('../utils/security').initialize(db);
   assert.equal((await q.get('SELECT count(*) n FROM reports')).n,before);
   assert.equal((await q.get('SELECT reset_token FROM users WHERE id=?',[userA.id])).reset_token,'sha256:'+'a'.repeat(64));
  });
  await caseTest('password limits reject bcrypt truncation and normalized duplicate registrations',async()=>{
   const visitor=jar();await get(visitor,'/register');const data={firm_name:'Duplicate',fca_firm_ref:'123456',name:'Duplicate',email:' A@EXAMPLE.INVALID ',mobile_number:'07000000000',password:'é'.repeat(37),confirmPassword:'é'.repeat(37)};
   assert.equal((await post(visitor,'/register/precheck',data)).status,400);
   data.password=data.confirmPassword='Safe-duplicate-password-123';assert.equal((await post(visitor,'/register/precheck',data)).location,'/terms');await get(visitor,'/terms');assert.equal((await post(visitor,'/register',{agree_terms:'yes'})).location,'/register');assert.equal((await q.get("SELECT count(*) n FROM users WHERE lower(trim(email))='a@example.invalid'")).n,1);
  });
  await caseTest('production refuses missing secrets and uses Secure cookies behind a trusted proxy',async()=>{
   const {execFileSync,spawnSync}=require('node:child_process');
   const childEnv=Object.fromEntries(Object.entries(process.env).filter(([k])=>! /^(GOOGLE_|EMAIL_|BOOKING_|DB_PATH|SESSION_SECRET|BASE_URL|NODE_ENV|TRUST_PROXY)/.test(k)));
   Object.assign(childEnv,{NODE_ENV:'production',DB_PATH:':memory:',BASE_URL:'https://example.invalid',SESSION_SECRET:''});
   const refused=spawnSync(process.execPath,['-e',"require('./server')"],{cwd:path.resolve(__dirname,'..'),env:childEnv,encoding:'utf8'});assert.notEqual(refused.status,0);assert.match(refused.stderr,/Set SESSION_SECRET/);
   childEnv.SESSION_SECRET='temporary-production-test-secret-1234567890';childEnv.DB_PATH=dbPath;childEnv.CUSTOMER_ID_FLOOR='1';
   const script=`(async()=>{const app=require('./server');await app.locals.databaseReady;const s=app.listen(0,'127.0.0.1');await new Promise(r=>s.once('listening',r));const response=await fetch('http://127.0.0.1:'+s.address().port+'/login',{headers:{'x-forwarded-proto':'https'}});await response.text();const cookie=response.headers.get('set-cookie');if(!cookie||!cookie.includes('Secure')||!cookie.includes('HttpOnly')||!cookie.includes('SameSite=Lax'))throw Error('Insecure production cookie');if(!response.headers.get('strict-transport-security'))throw Error('HSTS missing');await app.locals.stopBackgroundTasks();await new Promise(r=>s.close(r));await new Promise(r=>app.locals.db.close(r));console.log('PRODUCTION_SECURITY_OK')})().catch(e=>{console.error(e.message);process.exit(1)})`;
   assert.match(execFileSync(process.execPath,['-e',script],{cwd:path.resolve(__dirname,'..'),env:childEnv,encoding:'utf8',timeout:15000}),/PRODUCTION_SECURITY_OK/);
  });
  if(process.env.SECURITY_QA_OUTPUT){
   const output=path.resolve(process.env.SECURITY_QA_OUTPUT);fs.mkdirSync(output,{recursive:true});const pages=[],visitor=jar();
   for(const url of [...Object.keys(require('../config/seo-pages.json')),'/login','/register','/forgot-password','/verify-email-notice','/logout','/audit-not-found','/dashboard','/reports','/reports/new',`/reports/${owned.id}/edit`]){
    const authenticated=url.startsWith('/reports')||url==='/dashboard';const response=await get(authenticated?a:visitor,url);const file=(url==='/'?'home':url.slice(1).replaceAll('/','__'))+'.html';fs.writeFileSync(path.join(output,file),response.text);pages.push({path:url,status:response.status,file});
   }
   // Additional isolated responsive fixtures cover states that have no stable public URL.
   const capture=async(slug,response)=>{const file='state-'+slug+'.html';fs.writeFileSync(path.join(output,file),response.text);pages.push({path:'/qa-states/'+slug,status:response.status,file});};
   await q.run('DELETE FROM security_limits');
   const registration=jar();await get(registration,'/register');
   await capture('registration-error',await post(registration,'/register/precheck',{}));
   await post(registration,'/register/precheck',{firm_name:'Mobile QA Commercial Vehicles Limited',fca_firm_ref:'123456',name:'Mobile QA',email:'mobile-new@example.invalid',mobile_number:'07000000000',password:'Temporary-mobile-password-123',confirmPassword:'Temporary-mobile-password-123'});
   await capture('registration-terms',await get(registration,'/terms'));
   await post(registration,'/register',{agree_terms:'yes'});
   await capture('verification-resend',await get(registration,'/verify-email-notice'));
   const resetToken='e'.repeat(64),resetHash='sha256:'+require('node:crypto').createHash('sha256').update(resetToken).digest('hex');
   await q.run('UPDATE users SET reset_token=?,reset_token_expires=? WHERE id=?',[resetHash,new Date(Date.now()+3600000).toISOString(),userA.id]);
   const reset=jar();await capture('reset-password',await get(reset,'/reset-password/'+resetToken));
   await capture('reset-validation',await post(reset,'/reset-password/'+resetToken,{password:'short',confirmPassword:'short'}));
   await capture('unsubscribe-confirmation',await get(visitor,'/unsubscribe?token='+userA.unsubscribe_token));
   await capture('report-validation',await post(a,'/reports/new',body(months[0],{finance_commission:'invalid',lenders_brokers_used:'LongCustomerCompanyName'.repeat(40)})));
   await capture('stale-report',await post(a,'/reports/'+owned.id+'/edit',body(months[0],{revision:'0'})));
   await q.run('INSERT INTO users(email,password_hash,name,is_verified,terms_version) VALUES(?,?,?,1,?)',['mobile-empty@example.invalid',hash,'Mobile QA Empty Account',terms]);
   const empty=await login('mobile-empty@example.invalid');await capture('empty-dashboard',await get(empty,'/dashboard'));await capture('empty-reports',await get(empty,'/reports'));
   fs.writeFileSync(path.join(output,'pages.json'),JSON.stringify({pages},null,2));
  }
 } finally { await app.locals.stopBackgroundTasks();await new Promise(r=>server.close(r));await new Promise(r=>db.close(r));process.env=oldEnv;fs.rmSync(temp,{recursive:true,force:true}); }
});


