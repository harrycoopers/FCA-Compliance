import {withApiErrors,sameOrigin as portalSameOrigin,json} from '../../../lib/portal-auth';
import {bookingOwnerId} from '../../../lib/portal-auth';
import {getChatGPTUser} from '../../chatgpt-auth';
import {config} from '../../../lib/server';
import {syncMeetings,meetingList} from '../../../lib/booking-server';
async function handleGET(){const user=await getChatGPTUser();if(!user)return Response.json({error:'Sign in required'},{status:401});if(user.userId!==(await bookingOwnerId()))return Response.json({meetings:[],error:'Booking owner is not configured for this account.',accountId:user.userId},{headers:{'Cache-Control':'no-store'}});try{const status=await syncMeetings();return Response.json({...status,meetings:await meetingList(user.userId)},{headers:{'Cache-Control':'no-store'}});}catch(e){return Response.json({meetings:await meetingList(user.userId),error:String(e)},{headers:{'Cache-Control':'no-store'}});}}
async function handlePOST(request:Request){const user=await getChatGPTUser();if(!user||user.userId!==(await bookingOwnerId()))return Response.json({error:'Owner access required'},{status:403});if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Invalid origin'},{status:403});return Response.json({error:'Google connections are no longer used. Phone calls are read from the website.'},{status:410,headers:{'Cache-Control':'no-store'}});}

export const GET=withApiErrors(handleGET);

export const POST=withApiErrors(async(request:Request)=>portalSameOrigin(request)?handlePOST(request):json({error:'Invalid request origin.'},403));
