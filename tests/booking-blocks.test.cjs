'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),sqlite=require('sqlite3');
const {createService,instant}=require('../booking/service');
const env={BOOKING_ENABLED:'true',BOOKING_API_KEY:'isolated-test-key-32-characters-long',BOOKING_PUBLIC_URL:'https://example.invalid',BOOKING_CONFIRMATION_EMAIL_ENABLED:'false'};
const window=(date,start,end)=>({startDate:date,startTime:start,endDate:date,endTime:end,note:'Private appointment'});
const call=(date,time)=>({date,time,name:'QA Visitor',email:'qa@example.invalid',company:'QA',phone:'07700900123',topic:'unsure'});
test('unavailability validates UK times, respects interval boundaries and survives service restart',async()=>{
 const db=new sqlite.Database(':memory:');let now=new Date('2026-11-03T08:00Z');const s=createService({db,env,now:()=>now});await s.ready;
 try{
  const b=await s.saveBlock(window('2026-11-04','09:10','10:30'),'owner');
  const free=await s.freeTimes('2026-11-04');assert(!free.includes('09:00'));assert(!free.includes('09:30'));assert(!free.includes('10:00'));assert(free.includes('10:30'));
  await assert.rejects(s.reserve(call('2026-11-04','09:00'),'a'.repeat(32)),e=>e.status===409);
  await s.removeBlock(b);assert((await s.freeTimes('2026-11-04')).includes('09:00'));
  const boundary=await s.saveBlock(window('2026-11-04','09:15','09:30'),'owner');assert((await s.freeTimes('2026-11-04')).includes('09:00'));assert((await s.freeTimes('2026-11-04')).includes('09:30'));await s.removeBlock(boundary);
  for(const bad of [window('2026-02-30','09:00','10:00'),window('2026-11-04','10:00','09:00'),window('2026-11-04','09:00','09:00'),window('2027-03-28','01:30','03:00'),window('2027-10-31','01:30','03:00')])await assert.rejects(s.saveBlock(bad,'owner'),e=>e.status===400);
  const summer=await s.saveBlock(window('2027-06-01','09:00','10:00'),'owner');assert.equal(summer.start,'2027-06-01T08:00:00.000Z');await s.removeBlock(summer);
  const multi=await s.saveBlock({...window('2026-11-05','00:00','00:00'),endDate:'2026-11-07'},'owner');assert.deepEqual(await s.freeTimes('2026-11-05'),[]);assert.deepEqual(await s.freeTimes('2026-11-06'),[]);
  const restarted=createService({db,env,now:()=>now});await restarted.ready;assert.equal((await restarted.listBlocks()).length,1);await restarted.removeBlock(multi);
  const edit=await s.saveBlock(window('2026-11-04','09:00','10:00'),'owner');const changed=await s.saveBlock({...edit,startTime:'11:00',endTime:'12:00'},'owner');assert.equal(changed.revision,2);await assert.rejects(s.removeBlock(edit),e=>e.status===409);await assert.rejects(s.saveBlock({...edit,endTime:'13:00'},'owner'),e=>e.status===409);await s.removeBlock(changed);
 }finally{await new Promise(r=>db.close(r));}
});
test('database guards reject racing bookings/blocks and preserve existing calls',async()=>{
 const db=new sqlite.Database(':memory:'),s=createService({db,env,now:()=>new Date('2026-11-03T08:00Z')});await s.ready;
 try{
  const booked=await s.reserve(call('2026-11-04','09:00'),'b'.repeat(32));
  await assert.rejects(s.saveBlock(window('2026-11-04','09:05','10:00'),'owner'),e=>e.status===409&&/existing call/i.test(e.message));assert.equal((await s.get('SELECT status FROM meeting_bookings WHERE id=?',[booked.id])).status,'confirmed');
  const block=await s.saveBlock(window('2026-11-04','11:00','12:00'),'owner');
  await assert.rejects(s.run('UPDATE meeting_bookings SET start=?,time=? WHERE id=?',[instant('2026-11-04','11:00'),'11:00',booked.id]),/booking_blocked/);
  await assert.rejects(s.saveBlock({...block,startTime:'09:00'},'owner'),e=>e.status===409);
  const result=await Promise.allSettled([s.reserve(call('2026-11-04','14:00'),'c'.repeat(32)),s.saveBlock(window('2026-11-04','14:00','14:15'),'owner')]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
 }finally{await new Promise(r=>db.close(r));}
});
