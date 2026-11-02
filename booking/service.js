'use strict';
const crypto = require('node:crypto');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const slots = Array.from({length:17},(_,i)=>`${String(9+Math.floor(i/2)).padStart(2,'0')}:${i%2?'30':'00'}`);
const topics = {authorisation:'FCA authorisation assistance',ccr009:'CCR009 return assistance',ongoing:'Ongoing compliance support',finance:'Finance',referral:'Referral programme',unsure:'Not sure yet'};
function ukDate(now=new Date()){const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]));return `${p.year}-${p.month}-${p.day}`;}
function instant(date,time){let value=Date.parse(`${date}T${time}:00Z`),target=value;for(let i=0;i<3;i++){const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(p=>[p.type,p.value]));value+=target-Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);}return new Date(value).toISOString();}
function validDate(date){return typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&!isNaN(Date.parse(date))&&new Date(date+'T12:00Z').toISOString().slice(0,10)===date;}
function safeEqual(a,b){if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y);}
function normalizePhone(value){if(typeof value!=='string'||value.length>40||/[\x00-\x1f\x7f]/.test(value)||!/^\+?[\d ()\-.]+$/.test(value.trim()))throw Error('Please enter a valid phone number, including the country code if outside the UK.');const phone=value.trim().replace(/[ ()\-.]/g,'');if(!/^\+?\d{8,15}$/.test(phone)||/^\+?0+$/.test(phone))throw Error('Please enter a valid phone number, including the country code if outside the UK.');return phone;}
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function createService({db,env=process.env,sendEmail,now=()=>new Date(),ready:databaseReady=Promise.resolve()}){
 const run=(sql,args=[])=>new Promise((resolve,reject)=>db.run(sql,args,function(e){e?reject(e):resolve({changes:this.changes});}));
 const get=(sql,args=[])=>new Promise((resolve,reject)=>db.get(sql,args,(e,r)=>e?reject(e):resolve(r)));
 const all=(sql,args=[])=>new Promise((resolve,reject)=>db.all(sql,args,(e,r)=>e?reject(e):resolve(r)));
 const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/js/booking-availability.js'),'utf8'),context);const availability=context.window.bookingAvailability||{};
 const ready=(async()=>{
  await databaseReady;
  // Keep the existing table and slot index: old bookings must continue to hold their time.
  await run(`CREATE TABLE IF NOT EXISTS meeting_bookings(id TEXT PRIMARY KEY,request_key TEXT UNIQUE NOT NULL,fingerprint TEXT NOT NULL,date TEXT NOT NULL,time TEXT NOT NULL,start TEXT NOT NULL,name TEXT NOT NULL,email TEXT NOT NULL,company TEXT NOT NULL,topic TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',meet_url TEXT NOT NULL DEFAULT '',event_id TEXT NOT NULL,created TEXT NOT NULL,updated TEXT NOT NULL,error TEXT NOT NULL DEFAULT '',attempts INTEGER NOT NULL DEFAULT 0)`);
  const columns=new Set((await all('PRAGMA table_info(meeting_bookings)')).map(c=>c.name));
  for(const [name,definition] of Object.entries({phone:"TEXT NOT NULL DEFAULT ''",kind:"TEXT NOT NULL DEFAULT 'legacy'",email_status:"TEXT NOT NULL DEFAULT 'disabled'",email_attempts:'INTEGER NOT NULL DEFAULT 0',email_next_attempt:'INTEGER NOT NULL DEFAULT 0'})){
   if(!columns.has(name))try{await run(`ALTER TABLE meeting_bookings ADD COLUMN ${name} ${definition}`);}catch(e){if(!/duplicate column name/i.test(e.message))throw e;}
  }
  await run("CREATE UNIQUE INDEX IF NOT EXISTS meeting_slot_unique ON meeting_bookings(date,time) WHERE status IN ('pending','confirmed','needs_attention')");
  await run('CREATE TABLE IF NOT EXISTS meeting_limits(id TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL)');
  await run('CREATE INDEX IF NOT EXISTS meeting_limits_expiry ON meeting_limits(expires)');
  await run('CREATE TABLE IF NOT EXISTS meeting_processing(id TEXT PRIMARY KEY,owner TEXT NOT NULL,expires INTEGER NOT NULL)');
  // Never auto-convert an unfinished video appointment into a phone call without a number.
  await run("UPDATE meeting_bookings SET status='needs_attention',error='Existing appointment needs phone arrangements confirmed with the customer',updated=? WHERE kind='legacy' AND status='pending'",[now().toISOString()]);
 })();
 function configured(){try{const u=new URL(env.BOOKING_PUBLIC_URL);return env.BOOKING_ENABLED==='true'&&env.BOOKING_API_KEY?.length>=32&&!u.username&&!u.password&&(u.protocol==='https:'||(env.NODE_ENV!=='production'&&u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)));}catch{return false;}}
 function emailEnabled(){return typeof sendEmail==='function'&&env.BOOKING_CONFIRMATION_EMAIL_ENABLED!=='false'&&!!env.EMAIL_USER&&!!env.EMAIL_PASS;}
 async function status(){await ready;return {configured:!!configured(),connected:!!configured(),mode:'phone',confirmationEmailEnabled:emailEnabled()};}
 function checkDate(date){if(!validDate(date))return false;const today=ukDate(now()),end=new Date(today.slice(0,7)+'-01T12:00Z');end.setUTCMonth(end.getUTCMonth()+6);return ![0,6].includes(new Date(date+'T12:00Z').getUTCDay())&&date>=today&&date<end.toISOString().slice(0,10);}
 function reserved(date){const day=String(new Date(date+'T12:00Z').getUTCDay());return [...(availability.dates?.[date]||[]),...(availability.weekly?.[day]||[]),...(availability.reservedSlots?.(date,ukDate(now()),slots)||[])];}
 async function freeTimes(date){await ready;if(!configured())throw Error('Phone booking is not configured');if(!checkDate(date)){const e=Error('Choose an upcoming weekday');e.status=400;throw e;}const rows=await all("SELECT time FROM meeting_bookings WHERE date=? AND status IN ('pending','confirmed','needs_attention')",[date]);const blocked=new Set([...reserved(date),...rows.map(r=>r.time)]);return slots.filter(time=>Date.parse(instant(date,time))>now().getTime()&&!blocked.has(time));}
 function validate(body){if(!body||typeof body!=='object')throw Error('Please check your details');const fields={};for(const [key,max]of [['name',120],['company',160],['email',254]]){if(typeof body[key]!=='string'||!body[key].trim()||body[key].trim().length>max||/[\r\n\x00-\x1f]/.test(body[key]))throw Error('Please check your details');fields[key]=body[key].trim();}fields.email=fields.email.toLowerCase();fields.phone=normalizePhone(body.phone);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)||!Object.hasOwn(topics,body.topic)||!checkDate(body.date)||!slots.includes(body.time))throw Error('Please check your details and time');return {...fields,date:body.date,time:body.time,topic:body.topic};}
 async function reserve(body,key){await ready;if(!configured())throw Error('Phone booking is not configured');if(typeof key!=='string'||!/^[a-f0-9-]{32,64}$/i.test(key))throw Error('Invalid booking request');const fields=validate(body),fingerprint=crypto.createHash('sha256').update(JSON.stringify(fields)).digest('hex');let row=await get('SELECT * FROM meeting_bookings WHERE request_key=?',[key]);if(row){if(row.fingerprint!==fingerprint)throw Error('This request has different details. Start a new booking.');return row;}
  if(!(await freeTimes(fields.date)).includes(fields.time)){const e=Error('That time is no longer available. Please select another.');e.status=409;throw e;}
  const id=crypto.randomBytes(16).toString('hex'),created=now().toISOString();
  try{await run("INSERT INTO meeting_bookings(id,request_key,fingerprint,date,time,start,name,email,company,topic,event_id,created,updated,phone,kind,status,email_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'phone','confirmed',?)",[id,key,fingerprint,fields.date,fields.time,instant(fields.date,fields.time),fields.name,fields.email,fields.company,fields.topic,'b'+id,created,created,fields.phone,emailEnabled()?'pending':'disabled']);}
  catch(e){if(!String(e.code).startsWith('SQLITE_CONSTRAINT'))throw e;row=await get('SELECT * FROM meeting_bookings WHERE request_key=?',[key]);if(row&&row.fingerprint===fingerprint)return row;const err=Error('That time has just been reserved. Please choose another.');err.status=409;throw err;}
  return get('SELECT * FROM meeting_bookings WHERE id=?',[id]);
 }
 const active=new Set(),worker=crypto.randomBytes(24).toString('hex');
 async function processBooking(id){if(active.has(id)||!emailEnabled())return;active.add(id);let claimed=false,heartbeat;try{
  await ready;const lock=await run('INSERT INTO meeting_processing(id,owner,expires) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires=excluded.expires WHERE meeting_processing.expires<?',[id,worker,Date.now()+180000,Date.now()]);if(!lock.changes)return;claimed=true;heartbeat=setInterval(()=>run('UPDATE meeting_processing SET expires=? WHERE id=? AND owner=?',[Date.now()+180000,id,worker]).catch(()=>{}),10000);heartbeat.unref();
  const b=await get('SELECT * FROM meeting_bookings WHERE id=?',[id]);if(!b||b.kind!=='phone'||b.status!=='confirmed'||!['pending','retry'].includes(b.email_status)||b.email_next_attempt>now().getTime())return;
  if(Date.parse(b.start)<=now().getTime()){await run("UPDATE meeting_bookings SET email_status='failed' WHERE id=?",[id]);return;}
  await run('UPDATE meeting_bookings SET email_attempts=email_attempts+1 WHERE id=?',[id]);
  try{const date=new Intl.DateTimeFormat('en-GB',{dateStyle:'full',timeZone:'Europe/London'}).format(new Date(b.start));await sendEmail({to:b.email,subject:'Your 15-minute phone call with 009 Compliance',html:`<p>Hello ${escape(b.name)},</p><p>Your 15-minute phone call is booked for <strong>${escape(date)} at ${escape(b.time)} (UK time)</strong>.</p><p>We will call you on <strong>${escape(b.phone)}</strong>. No video link is needed.</p><p>Company: ${escape(b.company)}<br>Topic: ${escape(topics[b.topic])}</p><p>If your number is incorrect or you need to change the appointment, call 03300432377 or email info@009compliance.com.</p><p>Booking reference: ${escape(b.id)}</p>`});await run("UPDATE meeting_bookings SET email_status='sent',email_next_attempt=0 WHERE id=?",[id]);}
  catch{const attempts=b.email_attempts+1;await run('UPDATE meeting_bookings SET email_status=?,email_next_attempt=? WHERE id=?',[attempts>=5?'failed':'retry',now().getTime()+Math.min(3600000,60000*2**attempts),id]);}
 }finally{clearInterval(heartbeat);if(claimed)await run('DELETE FROM meeting_processing WHERE id=? AND owner=?',[id,worker]);active.delete(id);}}
 async function processPending(){await ready;if(!emailEnabled())return;for(const row of await all("SELECT id FROM meeting_bookings WHERE kind='phone' AND status='confirmed' AND email_status IN ('pending','retry') AND email_next_attempt<=? ORDER BY created LIMIT 10",[now().getTime()]))await processBooking(row.id);}
 async function limit(ip){await ready;const window=Math.floor(now().getTime()/600000),id=crypto.createHash('sha256').update(ip+':'+window).digest('hex');await run('DELETE FROM meeting_limits WHERE expires<?',[now().getTime()]);await run('INSERT INTO meeting_limits(id,count,expires) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1',[id,(window+1)*600000]);return (await get('SELECT count FROM meeting_limits WHERE id=?',[id])).count<=10;}
 return {ready,run,get,all,status,freeTimes,reserve,processBooking,processPending,limit,topics};
}
module.exports={createService,ukDate,instant,validDate,safeEqual,normalizePhone,slots,topics};
