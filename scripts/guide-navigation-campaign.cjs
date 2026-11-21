'use strict';
// Isolated local app: temporary SQLite, no .env, no credentials or outbound writes.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),Module=require('node:module'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'../.qa/node_modules/playwright-core');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'009-nav-campaign-'));
for(const key of Object.keys(process.env))if(/^(GOOGLE_|EMAIL_|SMTP_|BOOKING_|SHEETS_|REMINDER_|DASHBOARD_|PORTAL_)/.test(key))delete process.env[key];
process.env.DB_PATH=path.join(temp,'qa.sqlite');process.env.SESSION_SECRET='isolated-local-campaign-test';process.env.LOCAL_PREVIEW='true';process.env.BOOKING_ENABLED='false';process.env.GOOGLE_SHEETS_SYNC_ENABLED='false';
const load=Module._load;
Module._load=function(id,parent){if(id==='dotenv')return{config:()=>({})};if(id==='./utils/email'&&parent.filename.endsWith('server.js'))return{sendEmail:async()=>{throw Error('Outbound mail prohibited');}};return load.apply(this,arguments);};
const app=require('../server');Module._load=load;
const campaign=require('../config/campaign'),guides=require('../config/guide-content.json');
const routes=Object.keys(guides).filter(r=>guides[r].group==='fca');
const dir='docs/guide-navigation-animations',result={at:new Date().toISOString(),checks:[],liveExpiry:[],errors:[],submissions:0};
const scenarios=[{name:'active',now:'2026-11-12T12:00:00Z',mode:'continue',price:true,festive:true},{name:'expired-confirmed',now:'2026-12-26T00:00:01Z',mode:'continue',price:true,festive:false},{name:'expired-unconfirmed',now:'2026-12-26T00:00:01Z',mode:'unconfirmed',price:false,festive:false},{name:'expired-custom',now:'2026-12-26T00:00:01Z',mode:'custom',price:false,festive:false}];
(async()=>{
 await app.locals.databaseReady;const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true});
 async function context(options={}){const c=await browser.newContext(options);await c.route('**/*',r=>r.request().method()!=='GET'?r.abort():new URL(r.request().url()).origin!==base?r.fulfill({status:200,body:''}):r.continue());return c;}
 function observe(p){p.on('pageerror',e=>result.errors.push(e.message));p.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});}
 async function check(p,s,route,width){
  const target=p.locator('[data-guide-offer]'),text=await target.textContent();
  if(s.price){assert(text.includes('£100')&&text.includes('£600'));assert(text.includes('six monthly payments'));}
  else assert(!/£|six monthly payments|Payments are by/.test(text),s.name+' prices/terms leaked');
  assert.equal(await p.locator('[data-guide-gift]').count(),s.price?1:0);assert.equal(await p.locator('[data-guide-arrival]').count(),s.festive?1:0);assert.equal(await p.locator('[data-offer-countdown]').count(),s.festive?1:0);
  if(!s.festive){assert.equal(await p.locator('.has-festive-offer,.has-christmas-offer,.auth-card-snow').count(),0);assert(!/Christmas|Offer closes/.test(text));}
  const state=await p.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);return {unique:new Set(ids).size===ids.length,overflow:document.documentElement.scrollWidth>innerWidth};});assert(state.unique);assert(!state.overflow);assert(await p.locator('.afc-button').isVisible());
  result.checks.push({scenario:s.name,route,width,priceShown:s.price,festive:s.festive,duplicateIds:false,overflow:false});
 }
 try{
  const c=await context({viewport:{width:320,height:900}}),p=await c.newPage();observe(p);
  for(const s of scenarios){process.env.CAMPAIGN_NOW=s.now;campaign.postCampaign.mode=s.mode;for(const width of [320,1280]){await p.setViewportSize({width,height:900});for(const route of routes){assert.equal((await p.goto(base+route,{waitUntil:'networkidle'})).status(),200);await check(p,s,route,width);if(width===320&&route===routes[0]){await p.locator('[data-guide-offer]').scrollIntoViewIfNeeded();await p.screenshot({path:dir+'/campaign-'+s.name+'.png'});}}}}
  await c.close();
  // Native/no-JS and reduced motion also retain the price and expiry safeguards.
  for(const variant of ['no-js','reduced']){const c=await context({viewport:{width:390,height:844},...(variant==='no-js'?{javaScriptEnabled:false}:{reducedMotion:'reduce'})}),p=await c.newPage();observe(p);for(const s of scenarios){process.env.CAMPAIGN_NOW=s.now;campaign.postCampaign.mode=s.mode;await p.goto(base+routes[0],{waitUntil:'networkidle'});await check(p,{...s,name:s.name+'-'+variant},routes[0],390);assert.equal(await p.locator('.guide-arrival-canvas').count(),0);}await c.close();}
  // A tab left open crosses the real configured deadline, without reload.
  for(const mode of ['continue','unconfirmed','custom']){
   process.env.CAMPAIGN_NOW='2026-12-25T23:59:58Z';campaign.postCampaign.mode=mode;
   const c=await context({viewport:{width:390,height:844}}),p=await c.newPage();observe(p);
   await p.addInitScript(()=>{const OriginalDate=Date,started=OriginalDate.now(),epoch=OriginalDate.parse('2026-12-25T23:59:58Z');class TestDate extends OriginalDate{constructor(...args){super(...(args.length?args:[epoch+OriginalDate.now()-started]));}static now(){return epoch+OriginalDate.now()-started;}}window.Date=TestDate;});
   await p.goto(base+routes[0],{waitUntil:'load'});assert.equal(await p.locator('[data-guide-arrival]').count(),1);await p.waitForTimeout(3500);
   await check(p,{name:'live-expiry-'+mode,price:mode==='continue',festive:false},routes[0],390);
   assert.equal(await p.locator('template[data-guide-full-post],template[data-guide-gift-post]').count(),0);
   result.liveExpiry.push({mode,fallbackAppliedWithoutReload:true});await c.close();
  }
  assert.deepEqual(result.errors,[]);console.log(JSON.stringify({checks:result.checks.length,liveExpiry:result.liveExpiry,errors:result.errors,submissions:0}));
 }finally{fs.writeFileSync(dir+'/campaign-results.json',JSON.stringify(result,null,2)+'\n');await browser.close();await new Promise(r=>server.close(r));await app.locals.close();if(path.dirname(path.resolve(temp))!==path.resolve(os.tmpdir())||!path.basename(temp).startsWith('009-nav-campaign-'))throw Error('Unexpected temporary directory');fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
