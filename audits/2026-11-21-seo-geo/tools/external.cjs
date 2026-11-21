'use strict';
// Check every external link on local public pages: status/redirects (fetch) and, for JS-rendered
// FCA Handbook pages, the rendered section title (Chromium). Writes data/external-links.json.
const path=require('path'),fs=require('fs');
const {chromium}=require(path.resolve(__dirname,'../../../.qa/node_modules/playwright-core'));
const C=require('../data/crawl-local.json');
(async()=>{const ext={};for(const [src,rec] of Object.entries(C.pages))for(const l of rec.links||[]){if(!/^https?:/.test(l.href)||/127\.0\.0\.1|009compliance\.com/.test(l.href))continue;(ext[l.href]||={sources:new Set(),anchors:new Set()}).sources.add(src);ext[l.href].anchors.add(l.text);}
const b=await chromium.launch();const p=await b.newPage();const out=[];
for(const [u,v] of Object.entries(ext)){let rec={url:u,sources:[...v.sources],anchors:[...v.anchors].slice(0,3)};
 try{const chain=[];let url=u;for(let i=0;i<5;i++){const r=await fetch(url,{redirect:'manual',headers:{'user-agent':'Mozilla/5.0 009-audit'}});chain.push(r.status);if(r.status>=300&&r.status<400){url=new URL(r.headers.get('location'),url).href;continue;}rec.final=url;rec.status=r.status;rec.type=r.headers.get('content-type');break;}rec.chain=chain.join('>');}catch(e){rec.error=String(e);}
 if(/handbook\.fca|fca\.org\.uk\/(firms|consumers|publications)/.test(u)&&!/\.pdf$/.test(u)){try{await p.goto(u,{waitUntil:'networkidle',timeout:45000});rec.renderedTitle=await p.evaluate(()=>{const t=document.body.innerText.match(/You are viewing ([^\n]*?) as of/);return t?t[1]:document.title});}catch(e){rec.renderedTitle='ERR '+e.message.slice(0,60);}}
 out.push(rec);console.log(rec.chain,u.slice(0,95),'|',rec.renderedTitle||'');}
fs.writeFileSync(path.resolve(__dirname,'../data/external-links.json'),JSON.stringify(out,null,1));await b.close();})();
