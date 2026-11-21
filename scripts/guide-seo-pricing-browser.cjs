'use strict';
// Independent local app and temporary DB. Never reads .env or sends notifications.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),Module=require('node:module'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || '../.qa/node_modules/playwright-core');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'009-price-qa-'));
for(const key of Object.keys(process.env))if(/^(GOOGLE_|SMTP_|BOOKING_|SHEETS_)/.test(key))delete process.env[key];
process.env.DB_PATH=path.join(temp,'qa.sqlite');process.env.SESSION_SECRET='local-pricing-regression-only';
const load=Module._load;
Module._load=function(id,parent){
  if(id==='dotenv')return{config:()=>({})};
  if(id==='./utils/email'&&parent.filename.endsWith('server.js'))return{sendEmail:async()=>{throw Error('Delivery prohibited in pricing QA');}};
  return load.apply(this,arguments);
};
const app=require('../server');Module._load=load;
const campaign=require('../config/campaign'),guides=require('../config/guide-content.json');
const scenarios=[{name:'active',now:'2026-11-12T12:00:00Z',mode:'continue',show:true},{name:'confirmed-after-expiry',now:'2026-12-26T00:00:01Z',mode:'continue',show:true},{name:'unconfirmed',now:'2026-12-26T00:00:01Z',mode:'unconfirmed',show:false},{name:'custom-without-prices',now:'2026-12-26T00:00:01Z',mode:'custom',show:false}];
(async()=>{
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port,dir='docs/guide-seo-followup';
  const browser=await chromium.launch({headless:true});
  const result={observedAt:new Date().toISOString(),checks:[],errors:[],submissions:0};
  try{
    const context=await browser.newContext({viewport:{width:390,height:844}});
    await context.route('**/*',r=>r.request().method()!=='GET'?r.abort():new URL(r.request().url()).origin!==base?r.fulfill({status:200,body:''}):r.continue());
    const page=await context.newPage();page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});
    for(const scenario of scenarios){
      process.env.CAMPAIGN_NOW=scenario.now;campaign.postCampaign.mode=scenario.mode;
      for(const width of [320,1280]){
        await page.setViewportSize({width,height:900});
        for(const route of [...Object.keys(guides).filter(r=>guides[r].group==='fca'),'/fca-authorisation-motor-dealers']){
          const response=await page.goto(base+route,{waitUntil:'networkidle'});assert.equal(response.status(),200);
          const target=guides[route]?page.locator('.guide-offer'):page.locator('body');
          const text=await target.textContent();
          if(scenario.show){assert(text.includes('£100')&&text.includes('£600'));}
          else{assert(!/£|six monthly payments|Payments are by/.test(text),route);assert(await page.locator('.afc-button').isVisible());}
          assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),route);
          result.checks.push({scenario:scenario.name,width,route,priceShown:scenario.show,overflow:false,status:200});
          if(scenario.name==='unconfirmed'&&width===320&&route==='/fca-application-documents-motor-dealers'){
            await page.locator('.guide-offer').scrollIntoViewIfNeeded();await page.screenshot({path:dir+'/unconfirmed-price-mobile.png'});
          }
        }
      }
    }
    // All newly added contextual anchors are keyboard reachable and visibly focused.
    campaign.postCampaign.mode='continue';process.env.CAMPAIGN_NOW='2026-11-12T12:00:00Z';
    result.contextLinks=[];
    for(const route of Object.keys(guides)){
      await page.goto(base+route,{waitUntil:'networkidle'});
      const links=page.locator('.guide-context-link');
      for(let i=0;i<await links.count();i++){
        await links.nth(i).focus();
        const state=await links.nth(i).evaluate(el=>({active:document.activeElement===el,outline:getComputedStyle(el).outlineStyle,decoration:getComputedStyle(el).textDecorationLine,href:el.getAttribute('href'),text:el.textContent}));
        assert(state.active&&state.outline!=='none'&&state.decoration.includes('underline'));
        result.contextLinks.push({route,...state});
      }
      if(route==='/what-is-ccr009'){
        await page.locator('#guide-section-3').scrollIntoViewIfNeeded();await page.screenshot({path:dir+'/contextual-links-desktop.png'});
      }
    }
    assert.deepEqual(result.errors,[]);
    fs.writeFileSync(dir+'/pricing-browser-results.json',JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify({pricingChecks:result.checks.length,contextLinks:result.contextLinks.length,errors:result.errors,submissions:0}));
  }finally{
    await browser.close();await new Promise(r=>server.close(r));await app.locals.stopBackgroundTasks();await new Promise(r=>app.locals.db.close(r));
    if(path.dirname(path.resolve(temp))!==path.resolve(os.tmpdir())||!path.basename(temp).startsWith('009-price-qa-'))throw Error('Unexpected temporary directory');
    fs.rmSync(temp,{recursive:true,force:true});
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
