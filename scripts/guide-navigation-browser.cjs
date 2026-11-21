'use strict';
const fs=require('fs'),zlib=require('zlib'),assert=require('assert/strict'),crypto=require('crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'../.qa/node_modules/playwright-core');
const guides=require('../config/guide-content.json'),pages=require('../config/seo-pages.json');
const dir='docs/guide-navigation-animations',base='http://127.0.0.1:3100';
const before=JSON.parse(zlib.gunzipSync(fs.readFileSync(dir+'/rendered-before.json.gz')));
const result={at:new Date().toISOString(),routes:[],navigation:[],motion:[],reduced:[],noJs:[],bookings:[],errors:[]};
const normalize=s=>s.replace(/[a-f0-9]{16}\.(css|js)/g,'HASH.$1').replace(/\s+/g,' ').replace(/> </g,'><').trim();
async function block(c){await c.route('**/*',r=>r.request().method()!=='GET'?r.abort():new URL(r.request().url()).origin!==base?r.fulfill({status:200,body:''}):r.continue());}
(async()=>{
 const preserved=require('../'+dir+'/source-before.json');
 for(const f of ['config/guide-content.json','config/guide-links.json','config/seo-pages.json','config/offer.js','config/campaign.js','config/referral.js','public/js/auth-final-cta.js','views/partials/guide_booking.ejs'])assert.equal(crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),preserved[f].hash,f);
 const after={};for(const route of Object.keys(pages)){const r=await fetch(base+route);assert.equal(r.status,200);after[route]={status:r.status,html:await r.text(),headers:Object.fromEntries(r.headers)};}
 fs.writeFileSync(dir+'/rendered-after.json.gz',zlib.gzipSync(JSON.stringify(after)));
 const browser=await chromium.launch({headless:true});
 try{
 const context=await browser.newContext({viewport:{width:1280,height:900},hasTouch:true});await block(context);const page=await context.newPage();
 page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});
 await page.addInitScript(()=>{window.qa={cls:0,starts:[]};new PerformanceObserver(l=>l.getEntries().forEach(e=>{if(!e.hadRecentInput)window.qa.cls+=e.value;})).observe({type:'layout-shift',buffered:true});document.addEventListener('animationstart',e=>window.qa.starts.push(e.animationName));});
 for(const width of [320,390,768,1180,1440]){
  await page.setViewportSize({width,height:900});await page.goto(base+'/do-motor-dealers-need-fca-authorisation',{waitUntil:'networkidle'});
  const mode=width<1180?'mobile':'desktop',menu=page.locator('.guide-nav--'+mode),summary=menu.locator('summary');
  if(mode==='mobile')await page.locator('#mobileMenuBtn').tap();
  await summary.focus();await page.keyboard.press('Enter');await page.waitForFunction(m=>document.querySelector('.guide-nav--'+m+'>summary').getAttribute('aria-expanded')==='true',mode);
  assert.deepEqual((await menu.locator('a').evaluateAll(es=>es.map(e=>e.getAttribute('href')))).sort(),Object.keys(guides).sort());
  assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'menu overflow '+width);
  assert(await summary.evaluate(e=>getComputedStyle(e).outlineStyle!=='none'));
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.textContent.trim()),'View all guides →');
  await page.keyboard.press('Escape');assert.equal(await summary.getAttribute('aria-expanded'),'false');assert(await summary.evaluate(e=>e===document.activeElement));
  await page.keyboard.press('ArrowDown');assert(await menu.getAttribute('open')!==null);assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('href')),'/fca-compliance-motor-dealers-guide');
  await page.keyboard.press('Escape');await summary.tap();await page.waitForTimeout(40);assert.equal(await summary.getAttribute('aria-expanded'),'true');
  if(width===1440||width===390)await page.screenshot({path:dir+'/'+(mode==='desktop'?'desktop':'mobile')+'-menu.png'});
  await page.keyboard.press('Escape');if(mode==='mobile')await page.keyboard.press('Escape');
  result.navigation.push({width,mouseKeyboardTouch:true,all18Links:true,overflow:false});
 }
 for(const width of [390,768,1280]){await page.setViewportSize({width,height:900});for(const [route,g]of Object.entries(guides)){
  const response=await page.goto(base+route,{waitUntil:'networkidle'});assert.equal(response.status(),200);
  const state=await page.evaluate(old=>{
   const b=new DOMParser().parseFromString(old,'text/html');const fields=['.guide-answer','.guide-reviewed','#guide-faq','#guide-sources','#related-guides','.guide-breadcrumb'];
   return {title:document.title,description:document.querySelector('meta[name="description"]').content,canonical:document.querySelector('link[rel="canonical"]').href,robots:document.querySelector('meta[name="robots"]').content,h1:document.querySelector('h1').textContent,ids:[...document.querySelectorAll('[id]')].map(e=>e.id),scripts:[...document.scripts].map(e=>e.src).filter(Boolean),overflow:document.documentElement.scrollWidth>innerWidth,preserved:fields.every(s=>document.querySelector(s).innerHTML===b.querySelector(s).innerHTML),sections:[...document.querySelectorAll('section.ccr009-section[id^="guide-section-"]')].map(e=>e.innerHTML),oldSections:[...b.querySelectorAll('section.ccr009-section[id^="guide-section-"]')].map(e=>e.innerHTML),schema:[...document.querySelectorAll('script[type="application/ld+json"]')].map(e=>JSON.parse(e.textContent)),oldSchema:[...b.querySelectorAll('script[type="application/ld+json"]')].map(e=>JSON.parse(e.textContent)),contextLinks:[...document.querySelectorAll('.guide-context-link')].map(e=>[e.textContent,e.getAttribute('href')]),oldContextLinks:[...b.querySelectorAll('.guide-context-link')].map(e=>[e.textContent,e.getAttribute('href')]),gift:!!document.querySelector('[data-guide-gift]'),santa:!!document.querySelector('[data-guide-arrival]'),offers:document.querySelectorAll('[data-guide-offer]').length,closing:document.querySelectorAll('.afc-panel').length};
  },before[route].html);
  assert.equal(state.title,g.seoTitle);assert.equal(state.description,g.description);assert.equal(state.h1,g.title);assert.equal(state.canonical,'https://009compliance.com'+route);assert(!state.robots.includes('noindex'));assert(state.preserved,route);assert.deepEqual(state.sections,state.oldSections);assert.deepEqual(state.schema,state.oldSchema);assert.deepEqual(state.contextLinks,state.oldContextLinks);assert.equal(new Set(state.ids).size,state.ids.length,route+' IDs');assert.equal(new Set(state.scripts).size,state.scripts.length);assert(!state.overflow,route+' overflow '+width);assert.equal(state.gift,g.group==='fca');assert.equal(state.santa,g.group==='fca');assert.equal(state.offers,1);assert.equal(state.closing,1);
  result.routes.push({route,width,status:200,contentAndSeoPreserved:true,duplicateIds:false,overflow:false});
 }console.log('PASS all 18 guides '+width+'px');}
 // Same original homepage markup and artwork, apart from asset fingerprints/whitespace.
 await page.goto(base+'/',{waitUntil:'networkidle'});
 const home=await page.evaluate(old=>{const b=new DOMParser().parseFromString(old,'text/html');return {old:b.querySelector('main').innerHTML,now:document.querySelector('main').innerHTML};},before['/'].html);
 // Compare SSR rather than JS-added animation state or testimonial transitions.
 const main=html=>html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)[1];
 assert.equal(normalize(main(after['/'].html)),normalize(main(before['/'].html)),'homepage SSR changed');
 for(const route of ['/','/do-motor-dealers-need-fca-authorisation']){
  await page.goto(base+route,{waitUntil:'networkidle'});const gift=page.locator('[data-home-offer]');if(route!=='/')assert.equal(await page.locator('script[src*="guide-original-offers"]').count(),0,'animation bundle should wait until the card approaches');await gift.scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('[data-home-offer]').dataset.homeOfferReady==='true');
  const initial=await gift.locator('.gift-lid').evaluate(e=>getComputedStyle(e).transform);await page.waitForTimeout(8700);
  const end=await gift.locator('.gift-lid').evaluate(e=>({transform:getComputedStyle(e).transform,animations:e.getAnimations().map(a=>({name:a.animationName,time:a.currentTime,playState:a.playState})),price:getComputedStyle(e.closest('.offer-art').querySelector('.price-ticket')).opacity}));
  assert.notEqual(initial,end.transform);assert.equal(end.price,'1');assert(await page.evaluate(()=>window.qa.starts.includes('santa-arm-throw')&&window.qa.starts.includes('parcel-santa-throw')));
  if(route!=='/'){
   assert.equal(end.animations.filter(a=>a.playState==='running').length,0,'guide lid must settle');
   await page.screenshot({path:dir+'/fca-gift-desktop.png'});
   const bounds=await gift.evaluate(e=>({terms:e.querySelector('.offer-terms').getBoundingClientRect().top,art:e.querySelector('.present').getBoundingClientRect().bottom}));assert(bounds.terms>bounds.art,'gift overlaps terms');
   await gift.locator('.offer-button').click();assert.equal(new URL(page.url()).hash,'#guide-application-offer');
   const canvas=page.locator('.guide-arrival-canvas');await canvas.waitFor();
   const pixels=await canvas.evaluate(c=>c.toDataURL());await page.waitForTimeout(2400);assert.notEqual(await canvas.evaluate(c=>c.toDataURL()),pixels,'Santa must actually draw different frames');
   await page.screenshot({path:dir+'/fca-santa-desktop.png'});
   await page.waitForFunction(()=>document.querySelector('[data-guide-arrival]').dataset.arrivalComplete==='true',{},{timeout:20000});
   const settled=await canvas.evaluate(c=>c.toDataURL());await page.waitForTimeout(300);assert.equal(await canvas.evaluate(c=>c.toDataURL()),settled,'Santa keeps dancing');
   const rewards=page.locator('.rewards');await rewards.scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('.rewards').dataset.referralComplete==='true',{},{timeout:16000});assert.equal(await rewards.locator('[data-referral-amount]').textContent(),'0');assert.equal(await rewards.locator('[data-referral-discount]').textContent(),'100% off');
   assert.equal(await rewards.locator('.dealer.active').count(),4);
   await page.screenshot({path:dir+'/fca-referrals.png'});
   const seconds=await page.locator('[data-unit="seconds"]').textContent();await page.waitForTimeout(1100);assert.notEqual(await page.locator('[data-unit="seconds"]').textContent(),seconds);
  }
  result.motion.push({route,giftSequenceExecuted:true,...(route!=='/'?{santaFramesChanged:true,santaSettled:true,referralSequenceCompleted:true,countdownTicked:true,bundleDeferredUntilApproach:true}:{}),lidInitial:initial,lidFinal:end.transform,cls:await page.evaluate(()=>window.qa.cls)});
 }
 // Original booking calendar drawing executes on both guide groups.
 for(const route of ['/do-motor-dealers-need-fca-authorisation','/what-is-ccr009']){
  await page.goto(base+route,{waitUntil:'networkidle'});if(route==='/what-is-ccr009'){await page.locator('.guide-offer').scrollIntoViewIfNeeded();await page.screenshot({path:dir+'/ccr-assistance.png'});}
  await page.locator('.afc-art').scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('.afc-panel').classList.contains('afc-on'));await page.waitForTimeout(1600);assert(await page.locator('.afc-art').evaluate(e=>e.getAnimations({subtree:true}).some(a=>a.currentTime>0)));
  await page.screenshot({path:dir+(route==='/what-is-ccr009'?'/ccr-booking.png':'/fca-booking.png')});
  await page.locator('.afc-button').focus();await page.keyboard.press('Enter');await page.locator('[data-booking-studio]').waitFor();assert.equal(await page.locator('[data-bs-topic]').inputValue(),route==='/what-is-ccr009'?'ccr009':'authorisation');result.bookings.push({route,destination:page.url(),submitted:false});
 }
 // Static fallbacks are checked for every guide, including no-JS mobile navigation.
 const reduced=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});await block(reduced);const rp=await reduced.newPage();
 const noJs=await browser.newContext({viewport:{width:390,height:844},javaScriptEnabled:false});await block(noJs);const sp=await noJs.newPage();
 for(const [route,g]of Object.entries(guides)){
  await rp.goto(base+route,{waitUntil:'networkidle'});const moving=await rp.locator('.researched-guide').evaluate(e=>e.getAnimations({subtree:true}).filter(a=>a.playState==='running').map(a=>a.animationName));assert.deepEqual(moving,[],route+' reduced motion');assert.equal(await rp.locator('.guide-arrival-canvas').count(),0);result.reduced.push(route);
  await sp.goto(base+route,{waitUntil:'networkidle'});const box=await sp.locator('.guide-nav--mobile>summary').boundingBox();await sp.mouse.click(box.x+box.width/2,box.y+box.height/2);assert(await sp.locator('.guide-nav--mobile .guide-nav__all').isVisible());assert.equal(await sp.locator('.guide-nav--mobile a').count(),18);assert(!await sp.evaluate(()=>document.documentElement.scrollWidth>innerWidth));assert(await sp.locator('.afc-button').isVisible());if(g.group==='fca'){assert(await sp.locator('.offer-price').isVisible());assert(await sp.locator('[data-santa]').isVisible());}result.noJs.push(route);
 }
 await reduced.close();await noJs.close();assert.deepEqual(result.errors,[]);
 console.log('PASS navigation, preserved content, original animation execution, static/reduced fallbacks and booking navigation');
 }finally{fs.writeFileSync(dir+'/browser-results.json',JSON.stringify(result,null,2)+'\n');await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
