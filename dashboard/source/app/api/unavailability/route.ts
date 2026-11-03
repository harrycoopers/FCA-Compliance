import {withApiErrors,sameOrigin,json,getPortalUser,bookingOwnerId} from '../../../lib/portal-auth';
import {runtime} from '../../../../runtime/context';
async function handle(request:Request){
  const user=await getPortalUser();
  if(!user)return json({error:'Sign in required.'},401);
  if(user.userId!==await bookingOwnerId())return json({error:'Only the account receiving website calls can change availability.'},403);
  if(request.method!=='GET'&&!sameOrigin(request))return json({error:'Invalid request origin.'},403);
  const service=runtime().unavailability;
  if(!service)return json({error:'The website booking service is unavailable. Restart using dashboard/start.cjs.'},503);
  try{
    if(request.method==='GET')return json({blocks:await service.listBlocks()});
    let body:any;try{body=await request.json();}catch{return json({error:'Enter a valid time window.'},400);}
    if(request.method==='DELETE'){await service.removeBlock(body);return json({ok:true});}
    return json({block:await service.saveBlock(body,user.userId)});
  }catch(e:any){if(e.status===400||e.status===409)return json({error:e.message},e.status);throw e;}
}
export const GET=withApiErrors(handle);
export const POST=withApiErrors(handle);
export const DELETE=withApiErrors(handle);
