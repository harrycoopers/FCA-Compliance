import {runtime} from '../../runtime/context';
import {bookingOwnerId} from './portal-auth';
import {db,config,push,read} from './server';
export type Meeting={id:string;name:string;email:string;company:string;date:string;time:string;topic:string;status:string;phone:string;kind:'phone'|'legacy';confirmationEmail?:string;start:string;created:string;updated:string;error:string};
export async function bookingRequest(){return runtime().bookings();}
async function table(){await db().prepare('CREATE TABLE IF NOT EXISTS meeting_cache(owner TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(owner,id))').run();}
export async function meetingList(owner:string){await table();return (await db().prepare('SELECT value FROM meeting_cache WHERE owner=?').bind(owner).all<{value:string}>()).results.map(r=>JSON.parse(r.value) as Meeting).sort((a,b)=>a.start.localeCompare(b.start));}
export async function syncMeetings(){
 const owner=await bookingOwnerId();if(!owner)return {configured:false,synced:0};
 const result=await bookingRequest();await table();const {data}=await read(owner);
 const devices=(await db().prepare('SELECT * FROM devices WHERE owner=? AND enabled=1').bind(owner).all<any>()).results;
 for(const meeting of result.bookings as Meeting[]){
  await db().prepare('INSERT INTO meeting_cache(owner,id,value) VALUES (?,?,?) ON CONFLICT(owner,id) DO UPDATE SET value=excluded.value').bind(owner,meeting.id,JSON.stringify(meeting)).run();
  if(meeting.status!=='confirmed'&&meeting.status!=='needs_attention')continue;
  const tag='meeting:'+meeting.id+':'+meeting.status;
  const message=meeting.kind!=='phone'?`Existing appointment: ${meeting.date} at ${meeting.time}. Open Calls to confirm the customer’s phone details.`:meeting.status==='confirmed'?`New call booked: ${meeting.name}, ${meeting.company} — ${meeting.date} at ${meeting.time} UK time.`:`Booking needs attention: ${meeting.date} at ${meeting.time}. Open Calls.`;
  const now=new Date().toISOString();
  await db().prepare('INSERT OR IGNORE INTO deliveries(id,owner,return_id,version,message,date,state,read,attempts,updated) VALUES (?,?,?,?,?,?,?,0,0,?)').bind(tag,owner,'','meeting',message,meeting.updated,'in-app',now).run();
  // Do not send a backlog of phone alerts for historical appointments.
  if(Date.parse(meeting.start)<Date.now())continue;
  for(const device of devices){
   const id=tag+':'+device.id;
   await db().prepare('INSERT OR IGNORE INTO deliveries(id,owner,return_id,version,message,date,state,read,attempts,updated) VALUES (?,?,?,?,?,?,?,0,0,?)').bind(id,owner,'','meeting',message,meeting.updated,'pending',now).run();
   const claimed=await db().prepare("UPDATE deliveries SET state='sending',attempts=attempts+1,updated=? WHERE id=? AND attempts<3 AND (state='pending' OR (state='failed' AND updated<?))").bind(now,id,new Date(Date.now()-60000).toISOString()).run();
   if(!claimed.meta.changes)continue;
   try{await push(JSON.parse(device.subscription),data.settings.privacy?'New call booked. Open your dashboard for details.':message,'',id,'/?meeting='+encodeURIComponent(meeting.id));await db().prepare("UPDATE deliveries SET state='dispatched',updated=? WHERE id=?").bind(now,id).run();}
   catch{await db().prepare("UPDATE deliveries SET state='failed',error='Push delivery failed; check device and VAPID settings',updated=? WHERE id=?").bind(now,id).run();}
  }
 }
 return {configured:result.configured,connected:result.connected,synced:result.bookings.length};
}
