'use strict';
const fs=require('fs'),zlib=require('zlib'),crypto=require('crypto'),assert=require('assert/strict'),{chromium}=require('../.qa/node_modules/playwright-core');
const guides=require('../config/guide-content.json'),dir='docs/guide-design',base='http://127.0.0.1:3100';
const before=JSON.parse(zlib.gunzipSync(fs.readFileSync(dir+'/rendered-before.json.gz'))),sources=require('../'+dir+'/source-before.json');
const results={at:new Date().toISOString(),preserved:[],viewports:[],anchors:[],tables:[],reduced:[],noJs:[],nonGuide:[],errors:[]};
const changedSources=new Set(['views/seo_guide.ejs']);
for(const [file,old]of Object.entries(sources))if(!changedSources.has(file))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),old.hash,file+' unexpectedly changed');
async function capture(){const pages={};for(const route of Object.keys(before)){const r=await fetch(base+route);assert.equal(r.status,before[route].status,route);pages[route]={status:r.status,html:await r.text(),headers:Object.fromEntries(r.headers)};}fs.writeFileSync(dir+'/rendered-after.json.gz',zlib.gzipSync(JSON.stringify(pages)));return pages;}
(async()=>{const after=await capture();const browser=await chromium.launch();try{
 async function context(options={}){const c=await browser.newContext(options);await c.route('**/*',r=>r.request().method()!=='GET'?r.abort():new URL(r.request().url()).origin===base?r.continue():r.fulfill({status:200,body:''}));return c;}
 const c=await context({viewport:{width:1440,height:1000}}),p=await c.newPage();p.on('pageerror',e=>results.errors.push(e.message));p.on('console',m=>{if(m.type()==='error')results.errors.push(m.text());});
 await p.goto(base+'/what-is-ccr009',{waitUntil:'networkidle'});
 for(const route of Object.keys(guides)){
  const pair=await p.evaluate(({old,now})=>[old,now].map(html=>{const d=new DOMParser().parseFromString(html,'text/html'),root=d.querySelector('.researched-guide'),norm=s=>s.replace(/\s+/g,' ').trim();return {
   text:norm(root.textContent),links:[...root.querySelectorAll('a')].map(e=>[norm(e.textContent),e.getAttribute('href')]),headings:[...root.querySelectorAll('h1,h2,h3,h4')].map(e=>[e.tagName,norm(e.textContent)]),tables:[...root.querySelectorAll('table')].map(e=>e.innerHTML),faqs:[...root.querySelectorAll('.ccr009-faq__item')].map(e=>e.innerHTML),templates:[...root.querySelectorAll('template')].map(e=>e.innerHTML),title:d.title,metadata:[...d.querySelectorAll('meta:not([name="csrf-token"])')].map(e=>e.outerHTML),canonical:d.querySelector('link[rel="canonical"]').href,schema:[...d.querySelectorAll('script[type="application/ld+json"]')].map(e=>JSON.parse(e.textContent)),header:d.querySelector('header.gh').innerHTML};}),{old:before[route].html,now:after[route].html});assert.deepEqual(pair[1],pair[0],route+' content/metadata/links changed');results.preserved.push(route);
 }
 assert.equal(after['/robots.txt'].html,before['/robots.txt'].html);assert.equal(after['/sitemap.xml'].html,before['/sitemap.xml'].html);
 for(const width of [320,390,768,1440]){await p.setViewportSize({width,height:1000});for(const route of Object.keys(guides)){
  assert.equal((await p.goto(base+route,{waitUntil:'networkidle'})).status(),200);
  const state=await p.evaluate(()=>{const root=document.querySelector('.guide-studio'),ids=[...document.querySelectorAll('[id]')].map(e=>e.id);return{overflow:document.documentElement.scrollWidth>innerWidth,duplicateIds:ids.length!==new Set(ids).size,h1Opacity:getComputedStyle(root.querySelector('h1')).opacity,answerOpacity:getComputedStyle(root.querySelector('.guide-answer')).opacity,progress:root.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'),toc:root.querySelector('.guide-toc').open};});assert(!state.overflow&&!state.duplicateIds,route+' '+width);assert.equal(state.h1Opacity,'1');assert.equal(state.answerOpacity,'1');assert.equal(state.progress,'0');assert.equal(state.toc,width>1000);
  const nav=p.locator('#guide-navigation'),toc=nav.locator('.guide-toc');await nav.scrollIntoViewIfNeeded();await p.waitForTimeout(150);
  if(width<=1000)await toc.locator('summary').click();const link=nav.locator('a[href="#guide-section-2"]');await link.focus();await p.keyboard.press('Enter');await p.waitForTimeout(850);
  const anchor=await p.evaluate(()=>({top:document.querySelector('#guide-section-2').getBoundingClientRect().top,header:document.querySelector('.gh').getBoundingClientRect().bottom,nav:document.querySelector('#guide-navigation').getBoundingClientRect(),active:document.querySelector('#guide-navigation [aria-current="location"]')?.getAttribute('href'),percent:Number(document.querySelector('[role="progressbar"]').getAttribute('aria-valuenow')),open:document.querySelector('.guide-toc').open}));assert.equal(anchor.active,'#guide-section-2',route+' '+width+' active');assert(anchor.top>=anchor.header+8,route+' header covers target');if(width<=1000){assert(!anchor.open);assert(anchor.top>=anchor.nav.bottom+8,route+' menu covers target');}assert(anchor.percent>0);results.anchors.push({route,width,section2Top:anchor.top,progress:anchor.percent,active:anchor.active});
  const table=p.locator('.guide-table-wrap').first();if(width===320&&await table.count()){await table.scrollIntoViewIfNeeded();await table.focus();await p.keyboard.press('ArrowRight');await p.waitForTimeout(180);const scroll=await table.evaluate(e=>({left:e.scrollLeft,width:e.clientWidth,total:e.scrollWidth}));assert(scroll.total>scroll.width);assert(scroll.left>0);results.tables.push({route,...scroll});}
  const faq=p.locator('.ccr009-faq__item').first();await faq.locator('summary').click();assert(await faq.locator('p').isVisible());await faq.locator('summary').click();
  assert(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth));results.viewports.push({route,width,status:200,duplicateIds:false,overflow:false,visibleAnswer:true});
 }console.log('PASS all 18 guides at '+width);}
 await c.close();
 for(const mode of ['reduced','no-js']){const c=await context({viewport:{width:390,height:1000},...(mode==='reduced'?{reducedMotion:'reduce'}:{javaScriptEnabled:false})}),p=await c.newPage();for(const route of Object.keys(guides)){
  await p.goto(base+route,{waitUntil:'networkidle'});const nav=p.locator('#guide-navigation');await nav.scrollIntoViewIfNeeded();
  if(mode==='no-js'){const box=await nav.locator('summary').boundingBox();await p.mouse.click(box.x+box.width/2,box.y+box.height/2);}else await nav.locator('summary').click();
  assert(await nav.locator('a').first().isVisible());assert.equal(await nav.locator('a').count(),guides[route].sections.length+2);
  if(mode==='reduced'){const animations=await p.locator('.guide-studio').evaluate(e=>e.getAnimations({subtree:true}).filter(a=>a.playState==='running').map(a=>a.animationName));assert.deepEqual(animations,[]);assert.equal(await p.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior),'auto');}
  else assert(await p.locator('[role="progressbar"]').isHidden());
  const faq=p.locator('.ccr009-faq__item').first();await faq.scrollIntoViewIfNeeded();const box=await faq.locator('summary').boundingBox();await p.mouse.click(box.x+box.width/2,box.y+box.height/2);assert(await faq.locator('p').isVisible());
  assert(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth));results[mode==='reduced'?'reduced':'noJs'].push(route);
 }await c.close();console.log('PASS '+mode+' all 18');}
 // Same real page assets and presentation outside guide routes.
 const normalize=s=>{const token=s.match(/name="csrf-token" content="([^"]*)"/)?.[1];return token?s.replaceAll(token,'TOKEN'):s;};
 for(const route of Object.keys(after).filter(r=>!guides[r]&&!r.endsWith('.txt')&&!r.endsWith('.xml'))){assert.equal(normalize(after[route].html),normalize(before[route].html),route+' non-guide HTML changed');results.nonGuide.push(route);}
 assert.deepEqual(results.errors,[]);console.log('PASS exact preservation, anchors, tables, navigation, FAQ, reduced/no-JS and non-guide preservation');
}finally{fs.writeFileSync(dir+'/browser-results.json',JSON.stringify(results,null,2)+'\n');await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
