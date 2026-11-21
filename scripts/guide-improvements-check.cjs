'use strict';
const fs=require('fs'),zlib=require('zlib'),assert=require('assert/strict'),crypto=require('crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'../.qa/node_modules/playwright-core');
const guides=require('../config/guide-content.json'),registry=require('../config/seo-pages.json');
const dir='docs/guide-improvements-2026-11',base='http://127.0.0.1:3099';
const before=JSON.parse(zlib.gunzipSync(fs.readFileSync(dir+'/rendered-before.json.gz')));
const result={checkedAt:new Date().toISOString(),routes:[],links:[],nonGuide:[],sourceScope:[],reduced:[],noJs:[],booking:[],analytics:[],errors:[]};
const normalize=html=>html.replace(/(name="_csrf" value=")[^"]+/g,'$1TOKEN').replace(/(name="csrf-token" content=")[^"]+/g,'$1TOKEN').replace(/\s+/g,' ').trim();
async function block(context){await context.route('**/*',r=>!['GET','HEAD'].includes(r.request().method())?r.abort():new URL(r.request().url()).origin!==base?r.fulfill({status:200,body:''}):r.continue());}
(async()=>{
 const hashes=require('../'+dir+'/source-before-hashes.json');
 const allowed=new Set(['config/guide-content.json','config/seo-pages.json','config/asset-manifest.json','utils/seo.js','views/seo_guide.ejs','views/partials/guide_offer.ejs','views/partials/guide_reporting_offer.ejs','views/partials/guide_booking.ejs','public/css/guide-content.css']);
 for(const [file,oldHash] of Object.entries(hashes)){const current=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');if(!allowed.has(file))assert.equal(current,oldHash,'out-of-scope source change: '+file);result.sourceScope.push({file,unchanged:current===oldHash,scopedSharedChange:allowed.has(file)&&current!==oldHash});}
 const oldRegistry=require('../'+dir+'/registry-before.json');
 const after={};
 for(const route of Object.keys(registry)){
  const r=await fetch(base+route);assert.equal(r.status,200,route);const html=await r.text();after[route]={html,status:r.status,headers:Object.fromEntries(r.headers)};
  if(!guides[route]){assert.deepEqual(registry[route],oldRegistry[route]);const old=normalize(before[route].html),now=normalize(html);if(old!==now){let i=0;while(old[i]===now[i])i++;throw Error('Non-guide render differs '+route+' at '+i+' BEFORE '+old.slice(i,i+180)+' AFTER '+now.slice(i,i+180));}result.nonGuide.push({route,unchangedApartFromCsrfAndWhitespace:true});}
 }
 fs.writeFileSync(dir+'/rendered-after.json.gz',zlib.gzipSync(JSON.stringify(after)));
 const browser=await chromium.launch({headless:true});
 try{
 const ctx=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'no-preference'});await block(ctx);
 const page=await ctx.newPage();page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});
 await page.addInitScript(()=>{window.guideQa={cls:0,arrowStarts:0};new PerformanceObserver(l=>l.getEntries().forEach(e=>{if(!e.hadRecentInput)window.guideQa.cls+=e.value;})).observe({type:'layout-shift',buffered:true});document.addEventListener('animationstart',e=>{if(e.animationName==='guide-offer-draw')window.guideQa.arrowStarts++;});});
 const targets=new Set();
 for(const width of [320,390,768,1280]){
  await page.setViewportSize({width,height:900});
  for(const [route,g] of Object.entries(guides)){
   const response=await page.goto(base+route,{waitUntil:'networkidle'});assert.equal(response.status(),200);
   const state=await page.evaluate(()=>({title:document.title,description:document.querySelector('meta[name="description"]').content,canonical:document.querySelector('link[rel="canonical"]').href,robots:document.querySelector('meta[name="robots"]').content,h1:[...document.querySelectorAll('h1')].map(e=>e.textContent),headings:[...document.querySelectorAll('main h1,main h2,main h3,main h4')].map(e=>Number(e.tagName[1])),schemas:[...document.querySelectorAll('script[type="application/ld+json"]')].map(e=>JSON.parse(e.textContent)),breadcrumb:[...document.querySelectorAll('.guide-breadcrumb li')].map(e=>e.textContent.trim()),overflow:document.documentElement.scrollWidth>innerWidth,ids:[...document.querySelectorAll('[id]')].map(e=>e.id),offers:document.querySelectorAll('[data-guide-offer]').length,booking:document.querySelectorAll('.afc-button').length,scripts:[...document.scripts].map(s=>s.src).filter(Boolean),links:[...document.querySelectorAll('a[href]')].map(e=>e.getAttribute('href')).filter(h=>h.startsWith('/')||h.startsWith('#')),broken:[...document.images].filter(i=>i.complete&&!i.naturalWidth).map(i=>i.src),paragraphs:[...document.querySelectorAll('[id^="guide-section-"]>p.services-p')].map(p=>p.textContent)}));
   assert.equal(state.title,g.seoTitle);assert.equal(state.description,g.description);assert.equal(state.canonical,'https://009compliance.com'+route);assert(!state.robots.includes('noindex'));assert.deepEqual(state.h1,[g.title]);assert(!state.overflow,route+' overflow '+width);assert.deepEqual(state.broken,[]);assert.equal(new Set(state.ids).size,state.ids.length);assert.equal(new Set(state.scripts).size,state.scripts.length);assert.equal(state.offers,1);assert.equal(state.booking,1);
   for(let i=1;i<state.headings.length;i++)assert(state.headings[i]<=state.headings[i-1]+1,route+' heading jump');
   assert.deepEqual(state.paragraphs,g.sections.flatMap(s=>s.paragraphs));
   assert.deepEqual(state.schemas.find(s=>s['@type']==='BreadcrumbList').itemListElement.map(i=>i.name),state.breadcrumb);
   const article=state.schemas.find(s=>s['@type']==='Article');assert.equal(article.dateModified,g.modified);assert.equal(article.headline,g.title);assert(!state.schemas.some(s=>s['@type']==='FAQPage'));
   for(const href of state.links)targets.add(new URL(href,base+route).href);
   await page.locator('[data-guide-offer]').scrollIntoViewIfNeeded();await page.waitForTimeout(1700);
   const animation=await page.evaluate(()=>({starts:window.guideQa.arrowStarts,seen:document.querySelector('[data-guide-offer]').classList.contains('guide-offer-seen'),iterations:getComputedStyle(document.querySelector('.guide-offer-cue path')).animationIterationCount,cls:window.guideQa.cls}));assert(animation.seen);assert.equal(animation.starts,1);assert.equal(animation.iterations,'1');assert(animation.cls<0.01,route+' CLS '+animation.cls);
   await page.locator('.afc-button').scrollIntoViewIfNeeded();await page.locator('[data-guide-offer]').scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>window.guideQa.arrowStarts),1,'arrow replayed');
   for(const selector of ['.guide-context-link','.guide-offer .btn','.afc-button']){const elements=page.locator(selector);if(await elements.count()){await elements.first().focus();assert(await elements.first().evaluate(el=>document.activeElement===el&&getComputedStyle(el).outlineStyle!=='none'));}}
   result.routes.push({route,width,status:200,overflow:false,arrowRuns:animation.starts,cls:animation.cls,metadata:true,sourceParagraphsMatch:true});
  }
  console.log('PASS all 18 guides at '+width+'px');
 }
 for(const target of targets){const url=new URL(target),r=await ctx.request.get(target,{maxRedirects:5});assert.equal(r.status(),200,target);if(url.hash)assert((await r.text()).includes('id="'+decodeURIComponent(url.hash.slice(1))+'"'),target);result.links.push(url.pathname+url.search+url.hash);}
 await page.emulateMedia({reducedMotion:'reduce'});
 for(const route of Object.keys(guides)){await page.goto(base+route,{waitUntil:'networkidle'});const names=await page.locator('.guide-offer *,.afc-panel *').evaluateAll(els=>els.flatMap(e=>[getComputedStyle(e).animationName,getComputedStyle(e,'::before').animationName]).filter(n=>n!=='none'));assert.deepEqual(names,[],route+' reduced motion');result.reduced.push(route);}
 const noJs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});await block(noJs);const staticPage=await noJs.newPage();
 for(const [route,g] of Object.entries(guides)){await staticPage.goto(base+route,{waitUntil:'domcontentloaded'});assert(await staticPage.locator('.guide-offer .btn').isVisible());assert(await staticPage.locator('.afc-button').isVisible());assert.equal(await staticPage.locator('.guide-answer').textContent(),g.answer);assert(!await staticPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth));result.noJs.push(route);}await noJs.close();
 await page.emulateMedia({reducedMotion:'no-preference'});
 const priority=Object.keys(guides).slice(0,3).concat('/what-is-ccr009');
 for(const route of priority){await page.goto(base+route,{waitUntil:'networkidle'});await page.locator('.guide-offer .btn').focus();await page.keyboard.press('Enter');await page.locator('[data-booking-studio]').waitFor();const expected=guides[route].group==='ccr'?'ccr009':'authorisation';assert.equal(await page.locator('[data-bs-topic]').inputValue(),expected);result.booking.push({from:route,destination:page.url(),topic:expected,submitted:false});}
 // Test analytics with an in-memory Google-tag stub. Never transmit test events.
 await page.goto(base+priority[0]+'?private_value=must-not-be-collected',{waitUntil:'networkidle'});
 await page.evaluate(()=>{window.guideTestEvents=[];window.dataLayer=[];window.gtag=(...args)=>window.guideTestEvents.push(args);document.querySelector('[data-guide-id]').addEventListener('click',e=>{if(e.target.closest('a[data-guide-event]'))e.preventDefault();});});
 const click=async()=>page.locator('.guide-offer .btn').click();
 await click();assert.equal(await page.evaluate(()=>window.guideTestEvents.length),0);result.analytics.push('No consent: no event');
 await page.evaluate(()=>window.dataLayer.push(['consent','update',{analytics_storage:'granted'}]));await click();await page.locator('.afc-button').click();
 const events=await page.evaluate(()=>window.guideTestEvents);assert.deepEqual(events.map(e=>e[1]),['guide_offer_click','guide_booking_cta_click']);for(const event of events){assert.equal(event[2].guide_id,priority[0]);assert(!JSON.stringify(event).includes('must-not-be-collected'));assert(!event[1].includes('complete'));}result.analytics.push('Explicit grant: distinct offer/closing clicks, guide and placement, no query or form data');
 await page.evaluate(()=>window.dataLayer.push(['consent','update',{analytics_storage:'denied'}],['consent','default',{analytics_storage:'granted'}]));await click();assert.equal(await page.evaluate(()=>window.guideTestEvents.length),2);result.analytics.push('Revocation: no event; later default does not override denial');
 await page.evaluate(()=>{window.dataLayer=[['consent','default',{analytics_storage:'granted',region:['GB']}]];});await click();assert.equal(await page.evaluate(()=>window.guideTestEvents.length),2);result.analytics.push('Unresolved regional consent: no event');
 for(const [i,route] of priority.entries())for(const width of [390,1280]){await page.setViewportSize({width,height:900});await page.goto(base+route,{waitUntil:'networkidle'});await page.screenshot({path:dir+'/preview-'+(i+1)+'-'+width+'-answer.png'});await page.locator('[data-guide-offer]').scrollIntoViewIfNeeded();await page.waitForTimeout(700);await page.screenshot({path:dir+'/preview-'+(i+1)+'-'+width+'-offer.png'});}
 assert.deepEqual(result.errors,[]);console.log('PASS links, reduced motion, no JS, booking navigation, analytics and non-guide isolation');
 }finally{fs.writeFileSync(dir+'/browser-results.json',JSON.stringify(result,null,2)+'\n');await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
