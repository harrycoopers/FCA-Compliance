'use strict';
const crypto = require('node:crypto');
const fail = (message, status=400) => Object.assign(new Error(message), {status});
// All comparisons use UTC instants; intervals are half-open [start, end).
async function initializeBlocks(run) {
  await run(`CREATE TABLE IF NOT EXISTS booking_blocks (
    id TEXT PRIMARY KEY, start TEXT NOT NULL, end TEXT NOT NULL,
    start_date TEXT NOT NULL, start_time TEXT NOT NULL, end_date TEXT NOT NULL, end_time TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '', revision INTEGER NOT NULL DEFAULT 1,
    created_by TEXT NOT NULL, updated_by TEXT NOT NULL, CHECK(start < end))`);
  await run('CREATE INDEX IF NOT EXISTS booking_blocks_interval ON booking_blocks(start,end)');
  for (const [name, event] of [['insert','INSERT'],['update','UPDATE OF start,status']]) {
    await run(`CREATE TRIGGER IF NOT EXISTS booking_block_guard_${name} BEFORE ${event} ON meeting_bookings
      WHEN NEW.status IN ('pending','confirmed','needs_attention') AND EXISTS(
        SELECT 1 FROM booking_blocks WHERE start < strftime('%Y-%m-%dT%H:%M:%fZ',NEW.start,'+15 minutes') AND end > NEW.start)
      BEGIN SELECT RAISE(ABORT,'booking_blocked'); END`);
  }
  for (const [name, event] of [['insert','INSERT'],['update','UPDATE OF start,end']]) {
    await run(`CREATE TRIGGER IF NOT EXISTS booking_call_guard_${name} BEFORE ${event} ON booking_blocks
      WHEN EXISTS(SELECT 1 FROM meeting_bookings WHERE status IN ('pending','confirmed','needs_attention')
        AND start < NEW.end AND strftime('%Y-%m-%dT%H:%M:%fZ',start,'+15 minutes') > NEW.start)
      BEGIN SELECT RAISE(ABORT,'existing_call_conflict'); END`);
  }
}
function blockManager({run,get,all,ready,instant,validDate}) {
  function toInstant(date,time) {
    if (!validDate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time||'') || date<'2000-01-01' || date>'2100-12-31') throw fail('Enter valid start and end dates and times.');
    const value=instant(date,time);
    const fmt=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
    const target=date+' '+time;
    const matches=[-3600000,0,3600000].filter(offset=>fmt.format(new Date(Date.parse(value)+offset))===target);
    if(matches.length!==1 || matches[0]!==0) throw fail('This UK time is skipped or repeated by the clock change. Choose an unambiguous time.');
    return value;
  }
  async function listBlocks(){await ready;return all('SELECT id,start,end,start_date AS startDate,start_time AS startTime,end_date AS endDate,end_time AS endTime,note,revision FROM booking_blocks ORDER BY start,id');}
  async function saveBlock(input,owner){
    await ready;
    if(!input || typeof input!=='object')throw fail('Enter a time window.');
    const start=toInstant(input.startDate,input.startTime),end=toInstant(input.endDate,input.endTime);
    if(start>=end)throw fail('The end must be after the start.');
    if(typeof input.note!=='string'||input.note.length>500||/[\x00-\x1f]/.test(input.note))throw fail('Use a note of up to 500 characters.');
    const args=[start,end,input.startDate,input.startTime,input.endDate,input.endTime,input.note.trim(),owner];
    const id=input.id||crypto.randomUUID();
    try{
      if(input.id){
        if(typeof input.id!=='string'||input.id.length>100||!Number.isSafeInteger(input.revision)||input.revision<1)throw fail('Invalid saved time window.');
        const result=await run('UPDATE booking_blocks SET start=?,end=?,start_date=?,start_time=?,end_date=?,end_time=?,note=?,updated_by=?,revision=revision+1 WHERE id=? AND revision=?',[...args,id,input.revision]);
        if(!result.changes)throw fail('This time window changed on another device. Refresh and try again.',409);
      }else await run('INSERT INTO booking_blocks(start,end,start_date,start_time,end_date,end_time,note,updated_by,id,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)',[...args,id,owner]);
    }catch(e){if(e.message?.includes('existing_call_conflict'))throw fail('An existing call overlaps this window. It has not been cancelled. Choose a different window or arrange the call first.',409);throw e;}
    return (await listBlocks()).find(b=>b.id===id);
  }
  async function removeBlock(input){
    await ready;
    if(!input||typeof input.id!=='string'||!Number.isSafeInteger(input.revision))throw fail('Invalid saved time window.');
    const result=await run('DELETE FROM booking_blocks WHERE id=? AND revision=?',[input.id,input.revision]);
    if(!result.changes)throw fail('This time window changed on another device. Refresh and try again.',409);
  }
  return {listBlocks,saveBlock,removeBlock};
}
module.exports={initializeBlocks,blockManager};
