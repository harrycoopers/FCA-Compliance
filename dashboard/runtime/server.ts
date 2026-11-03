import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import {Readable} from 'node:stream';
import {context,type Runtime} from './context';
import {routes} from './routes';
import {userFromCookie,portalOrigin,json} from '../source/lib/portal-auth';
import {safeReturnTo} from '../source/lib/portal-redirect';
import {syncMeetings} from '../source/lib/booking-server';
import {processReminders} from '../source/lib/server';
import {renderToString} from 'react-dom/server';
import {createElement} from 'react';
import LoginForm from '../source/app/login/login-form';
const {openDatabase,initialize,fileBucket}=require('../runtime/storage.cjs');
const {settings}=require('../runtime/settings.cjs');

export async function createDashboard({root,website,env=process.env}:{root:string;website:any;env?:NodeJS.ProcessEnv}){
 const opts=settings(root,env),db=await openDatabase(opts.dbFile);
 try{await initialize(db,root);}catch(e){await db.close();throw e;}
 const runtime:Runtime={db,config:opts.config,bucket:fileBucket(path.join(opts.dataDir,'documents')),unavailability:website.locals.bookings,bookings:async()=>{
  await website.locals.databaseReady;
  const bookings=await new Promise<any[]>((resolve,reject)=>website.locals.db.all('SELECT id,name,email,company,phone,kind,date,time,topic,status,start,created,updated,error,email_status AS confirmationEmail FROM meeting_bookings ORDER BY start DESC LIMIT 2000',(e:any,rows:any)=>e?reject(e):resolve(rows)));
  let configured=false;try{const u=new URL(env.BOOKING_PUBLIC_URL||'');configured=env.BOOKING_ENABLED==='true'&&(env.BOOKING_API_KEY||'').length>=32&&!u.username&&!u.password&&(u.protocol==='https:'||(!opts.production&&u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)));}catch{}
  return {configured,connected:configured,mode:'phone',bookings};
 }};
 const app=express();app.disable('x-powered-by');
 const html=await fs.readFile(path.join(root,'dist/client/index.html'),'utf8');
 const csp="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
 app.use((_req:any,res:any,next:any)=>{res.set({'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow, noarchive','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY','Content-Security-Policy':csp});next();});
 app.get('/robots.txt',(_req:any,res:any)=>res.type('text').send('User-agent: *\nDisallow: /\n'));
 // Only the compiled public directory is served. Staff data and source are never exposed.
 app.use('/assets',express.static(path.join(root,'dist/client/assets'),{dotfiles:'deny',index:false,fallthrough:false,redirect:false}));
 for(const file of ['009-logo-transparent.png','favicon.svg','manifest.json','sw.js'])app.get('/'+file,(_req:any,res:any)=>res.sendFile(path.join(root,'dist/client',file)));
 app.use((req:any,res:any,next:any)=>context.run({...runtime,requestHeaders:new Headers(Object.entries(req.headers).filter(([,v])=>typeof v==='string') as [string,string][])},()=>void handle(req,res).catch(next)));
 async function handle(req:any,res:any){
  const pathname=new URL(req.originalUrl,opts.origin).pathname;
  const method=req.method==='HEAD'?'GET':req.method;
  const route=routes[pathname];
  if(!route){
   if(!['/','/login'].includes(pathname))return res.status(404).type('text').send('Page not found.');
   if(method!=='GET')return res.set('Allow','GET, HEAD').status(405).end();
   const user=await userFromCookie(req.headers.cookie||null);
   if(pathname==='/'&&!user){const target=safeReturnTo(req.originalUrl);return res.redirect(303,target==='/'?'/login':'/login?returnTo='+encodeURIComponent(target));}
   if(pathname==='/login'&&user)return res.redirect(303,safeReturnTo(new URL(req.originalUrl,opts.origin).searchParams.get('returnTo')));
   return res.type('html').send(html.replace('<!--LOGIN-->',pathname==='/login'?renderToString(createElement(LoginForm)):''));
  }
  if(!route[method])return res.set('Allow',Object.keys(route).join(', ')).status(405).json({error:'Method not allowed.'});
  // Do not buffer uploads from unauthenticated callers. /tick has separate bearer auth.
  if(!['/api/auth/login','/api/tick'].includes(pathname)&&!await userFromCookie(req.headers.cookie||null))return res.status(401).json({error:'Sign in required.'});
  const headers=new Headers(context.getStore()!.requestHeaders);
  let raw:Buffer|undefined;
  if(!['GET','HEAD'].includes(req.method)){
   if(pathname!=='/api/tick'&&headers.get('origin')!==portalOrigin())return res.status(403).json({error:'Invalid request origin.'});
   const max=pathname.startsWith('/api/auth/')?4096:pathname==='/api/documents'&&method==='POST'?9*1024*1024:16*1024*1024;
   if(Number(headers.get('content-length')||0)>max)return res.status(413).json({error:'Request too large.'});
   const chunks:Buffer[]=[];let size=0;
   for await(const chunk of req){size+=chunk.length;if(size>max){res.status(413).json({error:'Request too large.'});return;}chunks.push(chunk);}
   raw=Buffer.concat(chunks);
  }
  const request=new Request(new URL(req.originalUrl,opts.origin),{method:method,headers,body:raw?new Uint8Array(raw).buffer:undefined});
  const response:Response=await route[method](request);
  res.status(response.status);response.headers.forEach((value,key)=>res.setHeader(key,value));
  if(req.method==='HEAD'||!response.body)return res.end();
  await new Promise<void>((resolve,reject)=>{const stream=Readable.fromWeb(response.body as any);stream.on('error',reject);res.on('finish',resolve);res.on('close',()=>{stream.destroy();resolve();});stream.pipe(res);});
 }
 app.use((error:any,_req:any,res:any,_next:any)=>{if(res.headersSent){res.destroy();return;}if(error.status===404)return res.status(404).type('text').send('File not found.');console.error('[009 dashboard] Request failed. Check storage and configuration.');res.status(503).json({error:'Dashboard temporarily unavailable. Please retry.'});});
 let pending:Promise<any>|null=null,stopped=false;
 const tick=()=>{if(stopped)return Promise.resolve();if(!pending)pending=context.run(runtime,async()=>{const results=await Promise.allSettled([syncMeetings(),processReminders()]);if(results.some(r=>r.status==='rejected'))console.error('[009 dashboard] Background task failed; will retry.');return results;}).finally(()=>{pending=null;});return pending;};
 let timer:NodeJS.Timeout|undefined;
 if(opts.config.SCHEDULER_ACTIVE){timer=setInterval(()=>void tick(),60000);timer.unref();void tick();}
 return {app,options:opts,db,runtime,tick,close:async()=>{stopped=true;if(timer)clearInterval(timer);await pending;await db.close();}};
}
