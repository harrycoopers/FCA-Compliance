import {syncMeetings} from '../../../lib/booking-server';
import {processReminders,db,config} from '../../../lib/server';
import {withApiErrors,json} from '../../../lib/portal-auth';
import {digest} from '../../../lib/password.mjs';
function allowed(r:Request){const secret=config().DASHBOARD_MAINTENANCE_KEY;return !!secret&&secret.length>=32&&digest(r.headers.get('authorization')||'')===digest('Bearer '+secret);}
export const POST=withApiErrors(async(r:Request)=>{if(!allowed(r))return json({error:'Unauthorized'},401);const result=await processReminders();let meetings;try{meetings=await syncMeetings()}catch{meetings={error:'Booking sync failed'}}return json({...result,meetings,checkedAt:new Date().toISOString()});});
export const GET=withApiErrors(async(r:Request)=>{if(!allowed(r))return json({error:'Unauthorized'},401);const row=await db().prepare('SELECT COUNT(*) AS count FROM deliveries').first();return json({notificationCount:row?.count||0});});
