'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const sqlite=require('sqlite3'),{zipSync,strToU8,unzipSync,strFromU8}=require('fflate');
const {createDashboard}=require('../dist/server.cjs'),{openDatabase,fileBucket}=require('../runtime/storage.cjs');
const root=path.resolve(__dirname,'..'),websiteRoot=process.env.WEBSITE_TEST_SOURCE||path.resolve(root,'..');
const closeSql=db=>new Promise((r,j)=>db.close(e=>e?j(e):r()));
const crypto=require('node:crypto');
const password='Isolated local test password 2026';
test('production staff cookie is Secure, HttpOnly and restricted to its own host',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'009-cookie-test-'));
 const dash=await createDashboard({root,website:{locals:{}},env:{NODE_ENV:'production',DASHBOARD_DATA_DIR:dir,PORTAL_ORIGIN:'https://dashboard.example.invalid',DASHBOARD_SCHEDULER_ENABLED:'false'}});
 let server;
 try{const {hashPassword}=await import('../source/lib/password.mjs');await dash.db.prepare('INSERT INTO portal_accounts(id,email,name,password_hash,role,created) VALUES(?,?,?,?,?,?)').bind('owner','qa@example.invalid','QA',await hashPassword(password),'owner',Date.now()).run();
 server=dash.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/auth/login',{method:'POST',headers:{origin:'https://dashboard.example.invalid','content-type':'application/json'},body:JSON.stringify({email:'qa@example.invalid',password,remember:true})});assert.equal(r.status,200);const value=r.headers.get('set-cookie');assert.match(value,/; Secure/);assert.match(value,/; HttpOnly/);assert.match(value,/SameSite=Strict/);assert(!value.includes('Domain='));
 }finally{if(server)await new Promise(r=>server.close(r));await dash.close();await fs.rm(dir,{recursive:true,force:true});}
});
test('SQLite batches are atomic and isolated; private document keys cannot escape storage',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'009-storage-test-')),db=await openDatabase(path.join(dir,'staff.sqlite'));
 try{await db.exec('CREATE TABLE test(id TEXT PRIMARY KEY,value TEXT)');await assert.rejects(db.batch([db.prepare('INSERT INTO test VALUES(?,?)').bind('x','first'),db.prepare('INSERT INTO test VALUES(?,?)').bind('x','duplicate')]));assert.equal(await db.prepare('SELECT * FROM test').first(),null);
 await Promise.all([db.batch([db.prepare('INSERT INTO test VALUES(?,?)').bind('a','one'),db.prepare('INSERT INTO test VALUES(?,?)').bind('b','two')]),db.prepare('INSERT INTO test VALUES(?,?)').bind('c','three').run()]);assert.equal((await db.prepare('SELECT * FROM test').all()).results.length,3);
 const bucket=fileBucket(path.join(dir,'files'));await bucket.put('../../outside',Buffer.from('safe'));assert.equal(Buffer.from(await(await bucket.get('../../outside')).arrayBuffer()).toString(),'safe');assert.equal((await fs.readdir(path.join(dir,'files'))).length,1);await bucket.delete('../../outside');assert.equal(await bucket.get('../../outside'),null);
 }finally{await db.close();await fs.rm(dir,{recursive:true,force:true});}
});
test('Node dashboard preserves login, owner isolation, revisions, calls, documents, reminders and restart persistence',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'009-runtime-test-')),customerDb=new sqlite.Database(':memory:');
 const env={NODE_ENV:'development',PORTAL_ORIGIN:'http://localhost:3001',DASHBOARD_DATA_DIR:dir,DASHBOARD_SCHEDULER_ENABLED:'false',BOOKING_ENABLED:'true',BOOKING_API_KEY:'isolated-test-key-32-characters-long',BOOKING_PUBLIC_URL:'http://localhost:3000',BOOKING_CONFIRMATION_EMAIL_ENABLED:'false'};
 const vapid=crypto.createECDH('prime256v1');vapid.generateKeys();env.VAPID_PUBLIC_KEY=vapid.getPublicKey().toString('base64url');env.VAPID_PRIVATE_KEY=vapid.getPrivateKey().toString('base64url');
 const nativeFetch=global.fetch;let pushes=0;global.fetch=async(input,init)=>{const u=new URL(typeof input==='string'?input:input.url||String(input));if(u.hostname==='fcm.googleapis.com'){pushes++;return new Response('',{status:201});}if(!['localhost','127.0.0.1'].includes(u.hostname))throw Error('External requests disabled in tests');return nativeFetch(input,init);};
 const service=require(path.join(websiteRoot,'booking/service')).createService({db:customerDb,env,now:()=>new Date('2026-11-02T08:00Z')});await service.ready;
 const website={locals:{db:customerDb,databaseReady:service.ready,bookings:service}};
 let dash=await createDashboard({root,website,env}),server,base,cookie='',other='',saved,template,output;
 async function listen(){server=dash.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;}
 async function stop(){await new Promise(r=>server.close(r));await dash.close();}
 const req=(url,method='GET',body,session=cookie,origin=env.PORTAL_ORIGIN)=>fetch(base+url,{method,headers:{cookie:session,origin,...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'});
 try{
  const {hashPassword}=await import('../source/lib/password.mjs'),hash=await hashPassword(password);
  for(const [id,email,role]of[['owner','owner@example.invalid','owner'],['other','other@example.invalid','staff']])await dash.db.prepare('INSERT INTO portal_accounts(id,email,name,password_hash,role,created) VALUES(?,?,?,?,?,?)').bind(id,email,id,hash,role,Date.now()).run();
  await listen();
  await t.test('pages and APIs require staff authentication; no source or database is exposed',async()=>{
   assert.equal((await req('/')).status,303);assert.match(await(await req('/login')).text(),/Remember my login/);
   for(const route of ['/api/data','/api/meetings','/api/documents','/api/notifications','/api/documents/download?id=x'])assert.equal((await req(route)).status,401,route);
   for(const file of ['/source/lib/password.mjs','/runtime/settings.cjs','/.env','/staff.sqlite','/../staff.sqlite'])assert.equal((await req(file)).status,404,file);
   assert.match((await req('/login')).headers.get('x-robots-tag'),/noindex/);
   assert.equal((await req('/api/auth/login','POST',{email:'owner@example.invalid',password},'','https://evil.invalid')).status,403);
   assert.equal((await req('/api/auth/login','POST',{email:'owner@example.invalid',password},'','')).status,403);
   assert.equal((await req('/api/auth/login','POST',{email:'owner@example.invalid',password:'incorrect'})).status,401);
  });
  await t.test('remembered and short sessions retain their different lifetimes',async()=>{
   let r=await req('/api/auth/login','POST',{email:'owner@example.invalid',password,remember:true});assert.equal(r.status,200,await r.clone().text());cookie=r.headers.get('set-cookie').split(';')[0];assert.match(r.headers.get('set-cookie'),/Max-Age=34560000/);assert.match(r.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
   assert.equal((await dash.db.prepare('SELECT expires FROM portal_sessions WHERE account_id=?').bind('owner').first()).expires,0);
   r=await req('/api/auth/login','POST',{email:'other@example.invalid',password,remember:false},'');other=r.headers.get('set-cookie').split(';')[0];assert(!r.headers.get('set-cookie').includes('Max-Age'));
   assert.equal((await req('/login')).status,303);assert.equal((await req('/')).status,200);assert.match((await req('/api/data')).headers.get('set-cookie'),/Max-Age=34560000/);
   assert.equal((await req('/api/data','GET',undefined,other)).headers.get('set-cookie'),null);
  });
  await t.test('records stay isolated and concurrent revisions cannot overwrite each other',async()=>{
   saved=await(await req('/api/data')).json();saved.data.companies.push({id:'company',name:'QA Motors',contact:'Dummy',email:'qa@example.invalid',phone:'07700900123',registration:'123',fca:'456',notes:'Test only',archived:false});
   assert.equal((await req('/api/data','POST',saved,cookie,'https://other.invalid')).status,403);
   let r=await req('/api/data','POST',saved);assert.equal(r.status,200,await r.clone().text());assert.equal((await req('/api/data','POST',saved)).status,409);
   saved=await(await req('/api/data')).json();assert.equal(saved.data.companies.length,1);assert.equal((await(await req('/api/data','GET',undefined,other)).json()).data.companies.length,0);
   const concurrent=await Promise.all([req('/api/data','POST',saved),req('/api/data','POST',saved)]);assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);saved=await(await req('/api/data')).json();
  });
  await t.test('a website booking appears only for the owner and alerts deduplicate',async()=>{
   await service.reserve({date:'2026-11-03',time:'09:00',name:'QA Visitor',email:'visitor@example.invalid',company:'QA Dealer',phone:'07700 900123',topic:'authorisation'},'a'.repeat(32));
   let calls=await(await req('/api/meetings')).json();assert.equal(calls.meetings.length,1);assert.equal(calls.meetings[0].phone,'07700900123');assert.equal(calls.connected,true);assert(!JSON.stringify(calls).includes('meet.google'));
   await req('/api/meetings');assert.equal((await dash.db.prepare("SELECT count(*) AS n FROM deliveries WHERE owner='owner'").first()).n,1);
   assert.equal((await(await req('/api/meetings','GET',undefined,other)).json()).meetings.length,0);
   assert.equal((await req('/api/tick','POST',{})).status,401);
  });
  await t.test('availability is owner-only, origin-protected, durable and enforces public booking exclusions',async()=>{
   const before=await service.freeTimes('2026-11-04');
   const payload={startDate:'2026-11-04',startTime:'09:10',endDate:'2026-11-04',endTime:'11:00',note:'Private QA time'};
   assert.equal((await req('/api/unavailability','GET',undefined,'')).status,401);
   assert.equal((await req('/api/unavailability','GET',undefined,other)).status,403);
   assert.equal((await req('/api/unavailability','POST',payload,other)).status,403);
   assert.equal((await req('/api/unavailability','POST',payload,cookie,'https://evil.invalid')).status,403);
   let r=await req('/api/unavailability','POST',payload);assert.equal(r.status,200,await r.clone().text());let b=(await r.json()).block;
   assert.equal((await(await req('/api/unavailability')).json()).blocks.length,1);
   assert(!(await service.freeTimes('2026-11-04')).includes('09:00'));
   assert.equal((await req('/api/unavailability','POST',{...b,startTime:'11:00',endTime:'12:00'})).status,200);
   assert.equal((await req('/api/unavailability','DELETE',b)).status,409);
   b=(await(await req('/api/unavailability')).json()).blocks[0];
   await stop();dash=await createDashboard({root,website,env});await listen();
   assert.equal((await(await req('/api/unavailability')).json()).blocks[0].id,b.id);
   assert.equal((await req('/api/unavailability','DELETE',b,other)).status,403);
   assert.equal((await req('/api/unavailability','DELETE',b)).status,200);
   assert.deepEqual(await service.freeTimes('2026-11-04'),before);
   saved=await(await req('/api/data')).json();
   saved.data.pendingDeadlines=[{id:'missing-date',companyId:'company',title:'SAF test',type:'SAF test',notes:'Date not supplied'}];saved.data.calendarImportIds=['missing-date'];
   assert.equal((await req('/api/data','POST',saved)).status,200);
   saved=await(await req('/api/data')).json();assert.equal(saved.data.pendingDeadlines[0].id,'missing-date');
   assert.equal((await(await req('/api/data','GET',undefined,other)).json()).data.pendingDeadlines?.length||0,0);
   const stale=structuredClone(saved);delete stale.data.pendingDeadlines;delete stale.data.calendarImportIds;
   assert.equal((await req('/api/data','POST',stale)).status,200);saved=await(await req('/api/data')).json();assert.equal(saved.data.pendingDeadlines.length,1);
  });
  await t.test('push registration enforces provider and owner checks; delivery uses a mocked provider',async()=>{
   const device=crypto.createECDH('prime256v1');device.generateKeys();const subscription={endpoint:'https://fcm.googleapis.com/qa-only',keys:{p256dh:device.getPublicKey().toString('base64url'),auth:crypto.randomBytes(16).toString('base64url')}};
   assert.equal((await req('/api/devices','POST',{subscription:{...subscription,endpoint:'https://evil.invalid/push'}})).status,400);
   let r=await req('/api/devices','POST',{name:'QA device',subscription});assert.equal(r.status,200);const {id}=await r.json();
   assert.equal((await req('/api/devices','POST',{action:'test',id},other)).status,400);
   r=await req('/api/devices','POST',{action:'test',id});assert.equal(r.status,200,await r.clone().text());assert.equal(pushes,1);
   assert.equal((await req('/api/devices','POST',{action:'disable',id})).status,200);
  });
  await t.test('Word upload, review, generation and private download work on filesystem storage',async()=>{
   const bytes=zipSync({'[Content_Types].xml':strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),'word/document.xml':strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>[Company name]</w:t></w:r></w:p></w:body></w:document>')});
   const form=new FormData();form.set('file',new File([bytes],'qa.docx'));form.set('name','QA Template');form.set('save','true');
   let r=await fetch(base+'/api/documents',{method:'POST',headers:{cookie,origin:env.PORTAL_ORIGIN},body:form});assert.equal(r.status,200,await r.clone().text());template=await r.json();assert.equal(template.scan.occurrences.length,1);
   assert.equal((await req('/api/documents/download?kind=template&id='+template.id,'GET',undefined,other)).status,404);
   r=await req('/api/documents/generate','POST',{templateId:template.id,companyId:'company',overrides:{},removeYellow:true,confirmed:true,decisions:template.scan.occurrences.map(o=>({id:o.id,action:'field',approved:true,field:'name',value:'QA Motors'}))});assert.equal(r.status,200,await r.clone().text());output=await r.json();
   r=await req(output.download);assert.equal(r.status,200);assert.match(r.headers.get('content-disposition'),/attachment/);assert.match(r.headers.get('cache-control'),/no-store/);assert.match(strFromU8(unzipSync(new Uint8Array(await r.arrayBuffer()))['word/document.xml']),/QA Motors/);
   assert.equal((await req(output.download,'GET',undefined,other)).status,404);
   r=await req('/api/documents/generate','POST',{templateId:template.id,companyId:'company',overrides:{},removeYellow:true,confirmed:true,decisions:[]});assert.equal(r.status,400);
  });
  await t.test('scheduled in-app reminders deduplicate; restart retains data, documents and remembered login',async()=>{
   saved=await(await req('/api/data')).json();saved.data.returns.push({id:'test-return',companyId:'company',title:'QA return',due:'2026-11-03',status:'Not started',version:'qa',scheduled:[{offset:1,at:'2000-01-01T09:00Z'}]});
   await dash.db.prepare('UPDATE records SET value=? WHERE owner=?').bind(JSON.stringify(saved.data),'owner').run();await dash.tick();await dash.tick();assert.equal((await dash.db.prepare("SELECT count(*) AS n FROM deliveries WHERE return_id='test-return'").first()).n,1);
   await stop();dash=await createDashboard({root,website,env});await listen();assert.equal((await req('/api/data')).status,200);assert.equal((await(await req('/api/data')).json()).data.companies[0].name,'QA Motors');assert.equal((await req(output.download)).status,200);
  });
  await t.test('password changes revoke sessions and logout prevents reuse',async()=>{
   assert.equal((await req('/api/auth/password','POST',{currentPassword:password,password:'Replacement isolated password 2026'})).status,200);assert.equal((await req('/api/data')).status,401);
   const r=await req('/api/auth/login','POST',{email:'owner@example.invalid',password:'Replacement isolated password 2026',remember:true},'');cookie=r.headers.get('set-cookie').split(';')[0];assert.equal((await req('/api/auth/logout','POST',{})).status,200);assert.equal((await req('/api/data')).status,401);
  });
 }finally{global.fetch=nativeFetch;if(server?.listening)await stop();await closeSql(customerDb);await fs.rm(dir,{recursive:true,force:true});}
});
