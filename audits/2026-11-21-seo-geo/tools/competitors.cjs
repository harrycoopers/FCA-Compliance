'use strict';
// Fetch competitor pages (rendered in Chromium) and record title, H1, description, prices, schema types,
// word count and CTAs. Read-only. Writes data/competitors.json.
const path=require('path'),fs=require('fs');
const {chromium}=require(path.resolve(__dirname,'../../../.qa/node_modules/playwright-core'));
const urls=process.argv.slice(2);
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({userAgent:'Mozilla/5.0 (Windows NT 10.0) Chrome/130 009-audit'});const p=await ctx.newPage();const out=[];
for(const u of urls){try{const r=await p.goto(u,{waitUntil:'domcontentloaded',timeout:45000});await p.waitForTimeout(2500);
 const d=await p.evaluate(()=>{const t=document.body.innerText;const q=s=>document.querySelector(s);return{finalUrl:location.href,title:document.title,h1:[...document.querySelectorAll('h1')].map(h=>h.innerText.trim()).slice(0,3),desc:q('meta[name=description]')?.content||null,canonical:q('link[rel=canonical]')?.href||null,robots:q('meta[name=robots]')?.content||null,
 words:t.split(/\s+/).length,h2:[...document.querySelectorAll('h2')].map(h=>h.innerText.trim()).slice(0,14),prices:[...new Set((t.match(/[^\n.]{0,60}£\s?[\d,]+[^\n.]{0,60}/g)||[]).map(s=>s.trim()))].slice(0,12),
 ld:[...document.querySelectorAll('script[type="application/ld+json"]')].map(s=>{try{const j=JSON.parse(s.textContent);return [].concat(j['@graph']||j).map(x=>x['@type']).join('+')}catch(e){return 'ERR'}}),
 claims:[...new Set((t.match(/[^\n.]{0,70}(guarantee|approval rate|success rate|\d+%|days|weeks|years)[^\n.]{0,70}/gi)||[]).map(s=>s.trim()))].slice(0,10),
 internal:[...document.querySelectorAll('a[href]')].filter(a=>a.host===location.host).length,phone:/0\d{3,4}\s?\d{3}\s?\d{3,4}/.test(t)}});
 out.push({url:u,status:r.status(),...d});console.log(r.status(),u,'|',d.title);}catch(e){out.push({url:u,error:String(e).slice(0,120)});console.log('ERR',u);}}
fs.writeFileSync(path.resolve(__dirname,'../data/competitors.json'),JSON.stringify({fetchedAt:new Date().toISOString(),pages:out},null,1));await b.close();})();
