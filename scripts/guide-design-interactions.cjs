'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),{chromium}=require('../.qa/node_modules/playwright-core');
const base='http://127.0.0.1:3100',results={at:new Date().toISOString(),touch:[],bookings:[],errors:[],submissions:0};
(async()=>{const b=await chromium.launch();try{
 for(const width of [390,768,1440]){
  const c=await b.newContext({viewport:{width,height:1000},hasTouch:true});await c.route('**/*',r=>r.request().method()!=='GET'?r.abort():r.request().url().startsWith(base)?r.continue():r.fulfill({status:200,body:''}));const p=await c.newPage();p.on('pageerror',e=>results.errors.push(e.message));
  await p.goto(base+'/what-is-ccr009',{waitUntil:'networkidle'});
  const mode=width<1180?'mobile':'desktop';if(mode==='mobile')await p.locator('#mobileMenuBtn').tap();await p.locator('.guide-nav--'+mode+'>summary').tap();await p.waitForTimeout(220);assert.equal(await p.locator('.guide-nav--'+mode+'>summary').getAttribute('aria-expanded'),'true');assert.equal(await p.locator('.guide-nav--'+mode+' a').count(),18);await p.keyboard.press('Escape');if(mode==='mobile')await p.locator('#mobileMenuBtn').tap();
  if(width<1000){const nav=p.locator('#guide-navigation');await nav.scrollIntoViewIfNeeded();await nav.locator('summary').tap();await nav.locator('a[href="#guide-section-2"]').tap();await p.waitForTimeout(850);assert.equal(await nav.locator('[aria-current]').getAttribute('href'),'#guide-section-2');assert.equal(await nav.locator('.guide-toc').evaluate(e=>e.open),false);}
  assert(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth));results.touch.push({width,mainGuidesMenu:true,sectionMenu:width<1000});
  for(const [route,topic]of [['/do-motor-dealers-need-fca-authorisation','authorisation'],['/what-is-ccr009','ccr009'],['/consumer-duty-motor-dealers','ongoing']]){
   await p.goto(base+route,{waitUntil:'networkidle'});const button=p.locator('.afc-button');await button.scrollIntoViewIfNeeded();await button.focus();await p.keyboard.press('Enter');await p.locator('[data-booking-studio]').waitFor();const actual=await p.locator('[data-bs-topic]').inputValue();assert.equal(actual,topic);results.bookings.push({route,width,destination:p.url(),topic:actual,submitted:false});
  }await c.close();
 }
 assert.deepEqual(results.errors,[]);console.log(JSON.stringify(results));
}finally{fs.writeFileSync('docs/guide-design/interaction-results.json',JSON.stringify(results,null,2)+'\n');await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
