'use strict';
// Extract price and claim statements from every crawled HTML page (live and local) with context.
const path=require('path'),fs=require('fs');
const {chromium}=require(path.resolve(__dirname,'../../../.qa/node_modules/playwright-core'));
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({javaScriptEnabled:false});const p=await ctx.newPage();await p.route('**/*',r=>r.abort());
const out={};
for(const env of ['live','local']){const d=require(`../data/crawl-${env}.json`);const base=env==='live'?'https://009compliance.com':null;
 for(const [url,rec] of Object.entries(d.pages)){ if(!rec.title||rec.status!==200||url.includes('?')||(rec.robots||'').startsWith('noindex'))continue;
  let html; if(env==='live') html=await (await fetch(base+url)).text(); else continue; // local text taken from rendered files below
  await p.setContent(html);const text=await p.evaluate(()=>document.body.innerText.replace(/[ \t]+/g,' '));
  const hits=[];const re=/[^.\n]{0,90}(£\s?[\d,]+(?:\.\d+)?(?:\s?(?:million|m|k))?|\b\d+\+?\s?years?\b|guarantee\w*|\bweeks?\b|approval rate|success rate|\bfast(?:er|est)?\b|money.back|no win)[^.\n]{0,90}/gi;let m;
  while((m=re.exec(text)))hits.push(m[0].trim());out[env+' '+url]=[...new Set(hits)];}}
fs.writeFileSync(path.resolve(__dirname,'../data/claims-live.json'),JSON.stringify(out,null,1));await b.close();})();
