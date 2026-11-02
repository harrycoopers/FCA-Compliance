import {withApiErrors,sameOrigin as portalSameOrigin,json} from '../../../lib/portal-auth';
import {getChatGPTUser} from '../../chatgpt-auth';import {db,processReminders} from '../../../lib/server';
async function handlePOST(r:Request){const u=await getChatGPTUser();if(!u)return Response.json({error:'Sign in required'},{status:401});const b:any=await r.json();if(b.action==='check')return Response.json(await processReminders(u.userId));await db().prepare('UPDATE deliveries SET read=1 WHERE owner=?').bind(u.userId).run();return Response.json({ok:true})}
async function handleGET(){const u=await getChatGPTUser();if(!u)return Response.json({error:'Sign in required'},{status:401});const notifications=(await db().prepare('SELECT * FROM deliveries WHERE owner=? ORDER BY date DESC LIMIT 200').bind(u.userId).all()).results;return Response.json({notifications},{headers:{'Cache-Control':'no-store'}});}

export const POST=withApiErrors(async(request:Request)=>portalSameOrigin(request)?handlePOST(request):json({error:'Invalid request origin.'},403));

export const GET=withApiErrors(handleGET);
