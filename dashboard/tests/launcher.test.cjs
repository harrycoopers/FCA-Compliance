'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),http=require('node:http'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),source=process.env.WEBSITE_TEST_SOURCE||path.resolve(root,'..');
async function port(){const s=http.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
test('drop-in launcher preserves website routes and connects real local HTTP bookings to the private dashboard',async t=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'009-launcher-test-')),website=path.join(temp,'website');let child,logs='';
 const publicPort=await port(),portalPort=await port(),base='http://localhost:'+publicPort,portal='http://localhost:'+portalPort;
 const env={PATH:process.env.PATH,NODE_ENV:'development',PORT:String(publicPort),PORTAL_ORIGIN:portal,BASE_URL:base,DB_PATH:path.join(temp,'customer.sqlite'),DASHBOARD_DATA_DIR:path.join(temp,'staff'),DASHBOARD_SCHEDULER_ENABLED:'false',SESSION_SECRET:'isolated-launcher-test-secret-32-characters',BOOKING_ENABLED:'true',BOOKING_API_KEY:'isolated-booking-test-key-32-characters',BOOKING_PUBLIC_URL:base,BOOKING_CONFIRMATION_EMAIL_ENABLED:'false'};
 const filter=file=>!/(^|[/\\])(node_modules|dashboard|\.git|\.env(?:\..*)?|\.wrangler|\.sites-runtime)([/\\]|$)/.test(path.relative(source,file))&&!/\.(sqlite(?:-(?:wal|shm))?|db|log)$/.test(file);
 try{
  await fs.cp(source,website,{recursive:true,filter});
  await fs.cp(root,path.join(website,'dashboard'),{recursive:true,filter:f=>!/(^|[/\\])(node_modules|tests)([/\\]|$)/.test(path.relative(root,f))});
  await fs.symlink(await fs.realpath(path.join(source,'node_modules')),path.join(website,'node_modules'),'dir');
  async function runAccount(){const p=spawn(process.execPath,['dashboard/scripts/account.cjs','--stdin'],{cwd:website,env,stdio:['pipe','pipe','pipe']});let out='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>out+=x);p.stdin.end(JSON.stringify({email:'qa-owner@example.invalid',name:'QA Owner',password:'Isolated full launcher password 2026'}));assert.equal(await new Promise(r=>p.once('exit',r)),0,out);}
  await runAccount();
  const mailMock=path.join(temp,'mock-email.cjs');
  await fs.writeFile(mailMock,"const Module=require('node:module'),path=require('node:path'),load=Module._load;Module._load=function(id,parent){if(id==='./utils/email'&&path.basename(parent.filename)==='server.js')return {sendEmail:async()=>{}};return load.apply(this,arguments)};");
  env.NODE_OPTIONS='--require '+JSON.stringify(mailMock);
  child=spawn(process.execPath,['dashboard/start.cjs'],{cwd:website,env,stdio:['ignore','pipe','pipe']});child.stdout.on('data',x=>logs+=x);child.stderr.on('data',x=>logs+=x);
  const deadline=Date.now()+15000;while(!logs.includes('Website listening')){if(child.exitCode!==null||Date.now()>deadline)throw Error('Launcher failed: '+logs);await new Promise(r=>setTimeout(r,50));}
  await t.test('public pages, assets and original customer login remain available',async()=>{
   for(const route of ['/','/contact','/fca-authorisation-motor-dealers','/login','/robots.txt','/sitemap.xml']){const r=await fetch(base+route);assert.equal(r.status,200,route);assert(!r.headers.get('x-robots-tag')?.includes('noarchive'),route);}
   const login=await(await fetch(base+'/login')).text();assert(!login.includes('STAFF PORTAL'));const staff=await fetch(portal+'/login');assert.match(await staff.text(),/STAFF PORTAL/);assert.match(staff.headers.get('x-robots-tag'),/noindex/);
   assert.equal((await fetch(portal+'/',{redirect:'manual'})).status,303);
   assert.notEqual((await fetch(base+'/api/data')).status,200);
   assert.equal((await fetch(base+'/dashboard/runtime/settings.cjs')).status,404);
  });
  await t.test('native customer registration works alongside staff login',async()=>{
   let customerCookie='',token='';
   const staffLogin=await fetch(portal+'/api/auth/login',{method:'POST',headers:{origin:portal,'content-type':'application/json'},body:JSON.stringify({email:'qa-owner@example.invalid',password:'Isolated full launcher password 2026'})});
   assert.equal(staffLogin.status,200);const staffCookie=staffLogin.headers.get('set-cookie').split(';')[0];
   async function request(url,data){const r=await fetch(base+url,{redirect:'manual',method:data?'POST':'GET',headers:{cookie:[customerCookie,staffCookie].filter(Boolean).join('; '),...(data?{origin:base,'sec-fetch-site':'same-origin',accept:'text/html','content-type':'application/x-www-form-urlencoded'}:{})},body:data?new URLSearchParams({_csrf:token,...data}):undefined});const c=r.headers.get('set-cookie');if(c)customerCookie=c.split(';')[0];const html=await r.text();const t=html.match(/name="_csrf" value="([^"]+)"/);if(t)token=t[1];return r;}
   const form=await request('/register');assert.equal(form.headers.get('referrer-policy'),'same-origin');assert(token);const firstCookie=customerCookie;
   const precheck=await request('/register/precheck',{firm_name:'Isolated Registration',fca_firm_ref:'123456',name:'QA Customer',email:'registration@example.invalid',mobile_number:'07000000000',password:'Isolated-registration-password-123',confirmPassword:'Isolated-registration-password-123'});
   assert.equal(precheck.headers.get('location'),'/terms');assert.notEqual(customerCookie,firstCookie);
   await request('/terms');const registered=await request('/register',{agree_terms:'yes'});assert.equal(registered.headers.get('location'),'/dashboard');
   assert.equal((await request('/dashboard')).status,200);
   assert.equal((await fetch(portal+'/api/data',{headers:{cookie:staffCookie}})).status,200);
  });
  await t.test('valid website CSRF booking appears with phone details in the signed-in staff account',async()=>{
   let r=await fetch(base+'/contact');const customerCookie=r.headers.get('set-cookie').split(';')[0],html=await r.text(),csrf=html.match(/name="csrf-token" content="([a-f0-9]+)"/)[1];
   let d=new Date();d.setUTCDate(d.getUTCDate()+2);while([0,6].includes(d.getUTCDay()))d.setUTCDate(d.getUTCDate()+1);const date=d.toISOString().slice(0,10);
   const available=await(await fetch(base+'/api/bookings/availability?date='+date)).json();assert(available.times.length);
   const body={name:'Isolated Test',email:'visitor@example.invalid',company:'QA Only Motors',phone:'07700 900123',date,time:available.times[0],topic:'authorisation'};
   r=await fetch(base+'/api/bookings',{method:'POST',headers:{cookie:customerCookie,origin:base,'content-type':'application/json','x-csrf-token':csrf,'idempotency-key':'f'.repeat(32)},body:JSON.stringify(body)});assert.equal(r.status,201,await r.clone().text());
   const publicResult=await r.json();assert(!('phone'in publicResult));
   r=await fetch(portal+'/api/auth/login',{method:'POST',headers:{origin:portal,'content-type':'application/json'},body:JSON.stringify({email:'qa-owner@example.invalid',password:'Isolated full launcher password 2026',remember:true})});assert.equal(r.status,200);const session=r.headers.get('set-cookie').split(';')[0];
   const calls=await(await fetch(portal+'/api/meetings',{headers:{cookie:session}})).json();assert.equal(calls.meetings[0].phone,'07700900123');assert.equal(calls.meetings[0].company,'QA Only Motors');
   assert.equal((await fetch(base+'/internal/bookings')).status,401);
   const rejected=await fetch(portal+'/api/data',{headers:{cookie:customerCookie}});assert.equal(rejected.status,401);
  });
  await t.test('same main port routes by configured dashboard host, and ignores forwarded-host spoofing',async()=>{
   const request=headers=>new Promise((resolve,reject)=>{const req=http.get({host:'127.0.0.1',port:publicPort,path:'/login',headers},res=>{let text='';res.on('data',x=>text+=x);res.on('end',()=>resolve({status:res.statusCode,text}));});req.on('error',reject);});
   assert.match((await request({host:'localhost:'+portalPort})).text,/STAFF PORTAL/);
   assert(!(await request({host:'localhost:'+publicPort,'x-forwarded-host':'localhost:'+portalPort})).text.includes('STAFF PORTAL'));
  });
 }finally{if(child&&child.exitCode===null){const done=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await done;}await fs.rm(temp,{recursive:true,force:true});}
});
