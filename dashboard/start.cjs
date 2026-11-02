'use strict';
const path=require('node:path'),http=require('node:http');
const root=__dirname,websiteRoot=path.resolve(root,'..');
async function start(){
 process.chdir(websiteRoot);
 require('dotenv').config({path:path.join(websiteRoot,'.env')});
 const {settings}=require('./runtime/settings.cjs');const options=settings(root);
 const port=Number(process.env.PORT||3000);
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('PORT must be a valid port number.');
 // The website's existing module export avoids a second listener, with no website edits.
 const website=require(path.join(websiteRoot,'server.js'));
 let dashboard;const servers=[];
 const stop=async()=>{await Promise.all(servers.map(s=>new Promise(resolve=>{s.close(resolve);s.closeIdleConnections();})));await dashboard?.close();await website.locals.stopBackgroundTasks();await new Promise((resolve,reject)=>website.locals.db.close(e=>e?reject(e):resolve()));};
 try{
  if(!website.locals.databaseReady||!website.locals.db||!website.locals.stopBackgroundTasks)throw Error('This launcher requires the supplied 009 Compliance website server version.');
  await website.locals.databaseReady;
  dashboard=await require('./dist/server.cjs').createDashboard({root,website});
  const authority=req=>String(req.headers.host||'').toLowerCase();
  const dispatcher=(req,res)=>{
   // Match the actual Host only, never a caller-supplied X-Forwarded-Host.
   if(authority(req)===options.host.toLowerCase())return dashboard.app(req,res);
   return website(req,res);
  };
  const listen=async(server,listenPort,host)=>{servers.push(server);server.requestTimeout=30000;server.headersTimeout=15000;await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(listenPort,host,resolve);});};
  await listen(http.createServer(dispatcher),port,process.env.HOST||'0.0.0.0');
  if(!options.production&&new URL(options.origin).protocol==='http:'){
   const u=new URL(options.origin),dashboardPort=Number(u.port||80);
   if(dashboardPort===port)throw Error('Use a different local dashboard port in PORTAL_ORIGIN, such as http://localhost:3001.');
   await listen(http.createServer((req,res)=>{if(authority(req)!==options.host.toLowerCase()){res.writeHead(421);return res.end('Invalid dashboard host.');}dashboard.app(req,res);}),dashboardPort,u.hostname==='[::1]'?'::1':'127.0.0.1');
  }
  console.log('Website listening on port '+port+'. Dashboard: '+options.origin);
  let closing=false;for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{if(closing)return;closing=true;void stop().catch(()=>{process.exitCode=1;});});
  return {website,dashboard,servers,stop};
 }catch(e){await stop().catch(()=>{});throw e;}
}
if(require.main===module)start().catch(e=>{console.error('[009 dashboard] '+e.message);process.exitCode=1;});
module.exports={start};
