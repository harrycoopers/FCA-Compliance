'use strict';
const path=require('node:path');
function settings(root,env=process.env){
 const production=env.NODE_ENV==='production',websiteRoot=path.resolve(root,'..');
 const origin=env.PORTAL_ORIGIN||(production?'https://dashboard.009compliance.com':'http://localhost:3001');
 const u=new URL(origin);
 if(u.username||u.password||u.pathname!=='/'||u.search||u.hash||(!['https:','http:'].includes(u.protocol))||(u.protocol!=='https:'&&(production||!['localhost','127.0.0.1','[::1]'].includes(u.hostname))))throw Error('PORTAL_ORIGIN must be an HTTPS origin (HTTP localhost is allowed for development).');
 if(production&&!env.DASHBOARD_DATA_DIR)throw Error('Set DASHBOARD_DATA_DIR to a directory on your persistent disk before starting in production.');
 const dataDir=path.resolve(websiteRoot,env.DASHBOARD_DATA_DIR||'.009-dashboard-data');
 if(dataDir===websiteRoot)throw Error('Use a dedicated private data directory, not the website root.');
 for(const forbidden of [root,path.join(websiteRoot,'public'),path.join(websiteRoot,'views')]){
  const rel=path.relative(forbidden,dataDir);if(!rel||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel)))throw Error('DASHBOARD_DATA_DIR must be outside the dashboard, public and views folders.');
 }
 const dbFile=path.join(dataDir,'staff.sqlite');
 if(path.resolve(websiteRoot,env.DB_PATH||'db.sqlite')===dbFile)throw Error('The staff database must not be the customer database.');
 if(!!env.VAPID_PUBLIC_KEY!==!!env.VAPID_PRIVATE_KEY)throw Error('Set both VAPID keys, or leave both unset.');
 return {production,websiteRoot,origin:u.origin,host:u.host,dataDir,dbFile,config:{PORTAL_ORIGIN:u.origin,BOOKING_OWNER_ID:env.BOOKING_OWNER_ID||'',VAPID_PUBLIC_KEY:env.VAPID_PUBLIC_KEY||'',VAPID_PRIVATE_KEY:env.VAPID_PRIVATE_KEY||'',DASHBOARD_MAINTENANCE_KEY:env.DASHBOARD_MAINTENANCE_KEY||'',SCHEDULER_ACTIVE:env.DASHBOARD_SCHEDULER_ENABLED==='false'?'':'true'}};
}
module.exports={settings};
