'use strict';
// Replays saved original and final SSR HTML through identical local HTTP delivery.
// Run only against scripts/guide-seo-preview.cjs; no production requests/credentials.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),zlib=require('node:zlib'),os=require('node:os');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || '../.qa/node_modules/playwright-core');
const dir='docs/guide-seo-followup';
const routes=['/limited-permission-fca-authorisation-motor-dealers','/ccr009-reporting-checklist-motor-dealers','/consumer-duty-motor-dealers'];
const original=JSON.parse(zlib.gunzipSync(fs.readFileSync('docs/guide-seo-2026-11/rendered-before.json.gz')));
const final={};
const mime={'.css':'text/css','.js':'application/javascript','.woff2':'font/woff2','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon'};
const median=values=>values.slice().sort((a,b)=>a-b)[Math.floor(values.length/2)];
(async()=>{
  fs.mkdirSync(dir,{recursive:true});
  for(const route of [...Object.keys(require('../config/guide-content.json')),'/fca-authorisation-motor-dealers']) {
    const r=await fetch('http://127.0.0.1:3099'+route); if(r.status!==200)throw Error('Capture failed '+route);
    final[route]={status:r.status,html:await r.text(),headers:Object.fromEntries(r.headers)};
  }
  fs.writeFileSync(dir+'/rendered-after.json.gz',zlib.gzipSync(JSON.stringify(final)));
  const publicRoot=path.resolve('public');
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    let body,type;
    if(routes.includes(url.pathname)) {
      body=Buffer.from((url.searchParams.get('variant')==='before'?original:final)[url.pathname].html);type='text/html';
    } else {
      const target=path.resolve(publicRoot,'.'+decodeURIComponent(url.pathname));
      if(!target.startsWith(publicRoot+path.sep)||!fs.existsSync(target)||!fs.statSync(target).isFile()){res.writeHead(404);res.end();return;}
      body=fs.readFileSync(target);type=mime[path.extname(target)]||'application/octet-stream';
    }
    const gzip=/^(text\/|application\/javascript|image\/svg)/.test(type);
    if(gzip)body=zlib.gzipSync(body);
    res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','Content-Length':body.length,...(gzip?{'Content-Encoding':'gzip'}:{})});res.end(body);
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true});
  const result={observedAt:new Date().toISOString(),baseline:'Original pre-task rendered-before.json.gz, unchanged original fingerprinted assets',conditions:{browser:browser.version(),os:os.platform()+' '+os.release(),cpu:os.cpus()[0].model,viewport:'390 x 844; device scale factor 1',cpuSlowdown:4,latencyMs:150,downloadBitsPerSecond:1600000,uploadBitsPerSecond:750000,cache:'disabled; new browser context each run',runsPerVariant:5,order:'alternating before/after each repeat',delivery:'same local HTTP replay server, gzip HTML/CSS/JS, original/final HTML and matching fingerprinted assets; external traffic blocked',timing:'3 seconds after load at top; 1.5 seconds after scrolling calendar into view',limitations:'Lab simulation, not field Core Web Vitals, not Lighthouse score. No production TTFB/CDN or third-party latency. Long-task blocking is an observation-window sum, not Lighthouse TBT; no INP claim.'},runs:[],summary:[]};
  try {
    for(const route of routes) for(let repeat=1;repeat<=5;repeat++) for(const variant of repeat%2 ? ['before','after']:['after','before']) {
      const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,reducedMotion:'no-preference'});
      await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.fulfill({status:200,body:''}));
      const page=await context.newPage();
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
      const cdp=await context.newCDPSession(page);
      await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
      await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:1600000/8,uploadThroughput:750000/8});
      await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
      await page.addInitScript(()=>{
        window.lab={lcp:0,cls:0,longTasks:[]};
        new PerformanceObserver(l=>l.getEntries().forEach(e=>window.lab.lcp=e.startTime)).observe({type:'largest-contentful-paint',buffered:true});
        new PerformanceObserver(l=>l.getEntries().forEach(e=>{if(!e.hadRecentInput)window.lab.cls+=e.value;})).observe({type:'layout-shift',buffered:true});
        new PerformanceObserver(l=>l.getEntries().forEach(e=>window.lab.longTasks.push(e.duration))).observe({type:'longtask',buffered:true});
      });
      await page.goto(base+route+'?variant='+variant,{waitUntil:'load'});
      await page.waitForTimeout(3000);
      const top=await page.evaluate(()=>({...window.lab,fcp:performance.getEntriesByName('first-contentful-paint')[0]?.startTime||null,resources:performance.getEntriesByType('resource').map(r=>({name:new URL(r.name).pathname,encodedBodySize:r.encodedBodySize,transferSize:r.transferSize})),navigation:performance.getEntriesByType('navigation')[0].toJSON()}));
      await page.locator('.afc-art').scrollIntoViewIfNeeded();await page.waitForTimeout(1500);
      const end=await page.evaluate(()=>({...window.lab,overflow:document.documentElement.scrollWidth>innerWidth,calendarRunning:document.querySelector('.afc-panel').classList.contains('afc-on')}));
      const run={route,variant,repeat,fcpMs:top.fcp,lcpMs:top.lcp,cls:end.cls,blockingMs:top.longTasks.reduce((a,d)=>a+Math.max(0,d-50),0),calendarBlockingMs:end.longTasks.slice(top.longTasks.length).reduce((a,d)=>a+Math.max(0,d-50),0),requests:top.resources.length+1,encodedBytes:top.resources.reduce((a,r)=>a+r.encodedBodySize,top.navigation.encodedBodySize),htmlBytes:top.navigation.encodedBodySize,resources:top.resources,overflow:end.overflow,calendarRunning:end.calendarRunning,errors};
      result.runs.push(run);await context.close();
      console.log(JSON.stringify({route,variant,repeat,FCP:Math.round(run.fcpMs),LCP:Math.round(run.lcpMs),CLS:run.cls,bytes:run.encodedBytes,errors}));
    }
    for(const route of routes)for(const variant of ['before','after']) {
      const runs=result.runs.filter(r=>r.route===route&&r.variant===variant),row={route,variant};
      for(const key of ['fcpMs','lcpMs','cls','blockingMs','calendarBlockingMs','requests','encodedBytes']) {
        const values=runs.map(r=>r[key]);row[key]={median:median(values),min:Math.min(...values),max:Math.max(...values)};
      }
      result.summary.push(row);
    }
    fs.writeFileSync(dir+'/performance-results.json',JSON.stringify(result,null,2)+'\n');
    console.log('Saved 30 lab runs.');
  } finally {await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
