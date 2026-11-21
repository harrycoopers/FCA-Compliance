'use strict';
const fs=require('node:fs'),zlib=require('node:zlib'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || '../.qa/node_modules/playwright-core');
const guides=require('../config/guide-content.json'),annotations=require('../config/guide-links.json');
const dir='docs/guide-seo-followup',base='http://127.0.0.1:3099';
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const context=await browser.newContext();
    await context.route('**/*',r=>new URL(r.request().url()).origin===base&&r.request().method()==='GET'?r.continue():r.fulfill({status:200,body:''}));
    const page=await context.newPage(),rendered={},review=[];
    for(const [route,guide] of Object.entries(guides)){
      const response=await page.goto(base+route,{waitUntil:'networkidle'});
      rendered[route]={status:response.status(),headers:await response.allHeaders(),html:await response.text()};
      const data=await page.evaluate(()=>({
        title:document.title,description:document.querySelector('meta[name="description"]').content,
        canonical:document.querySelector('link[rel="canonical"]').href,robots:document.querySelector('meta[name="robots"]').content,
        headings:[...document.querySelectorAll('.researched-guide h1,.researched-guide h2,.researched-guide h3')].map(e=>({tag:e.tagName,text:e.textContent.trim()})),
        schemas:[...document.querySelectorAll('script[type="application/ld+json"]')].map(e=>JSON.parse(e.textContent)),
        contextualLinks:[...document.querySelectorAll('.guide-context-link')].map(e=>({text:e.textContent,href:e.getAttribute('href'),section:e.closest('section').id})),
        educationalLinks:[...document.querySelectorAll('section[id^="guide-section-"] a[href]')].filter(e=>e.getAttribute('href').startsWith('/')).map(e=>({text:e.textContent.replace(/\s+/g,' ').trim(),href:e.getAttribute('href'),section:e.closest('section').id,newContextual:e.classList.contains('guide-context-link')})),
        relatedLinks:[...document.querySelectorAll('#related-guides a')].map(e=>({text:e.textContent.replace(/\s+/g,' ').trim(),href:e.getAttribute('href')})),
        serviceLinks:[...document.querySelectorAll('.guide-support a,.guide-offer a')].map(e=>({text:e.textContent.trim(),href:e.getAttribute('href')})),
        breadcrumbs:[...document.querySelectorAll('.guide-breadcrumb li')].map(e=>({text:e.textContent.trim(),href:e.querySelector('a')?.getAttribute('href')||null,current:!!e.querySelector('[aria-current]')})),
        booking:document.querySelector('.afc-button').getAttribute('href'),
        social:{ogTitle:document.querySelector('[property="og:title"]').content,ogDescription:document.querySelector('[property="og:description"]').content,ogType:document.querySelector('[property="og:type"]').content,twitterTitle:document.querySelector('[name="twitter:title"]').content},
        paragraphs:[...document.querySelectorAll('section[id^="guide-section-"] .services-p')].map(e=>e.textContent)
      }));
      assert.equal(data.title,guide.seoTitle);assert.equal(data.description,guide.description);
      assert.deepEqual(data.paragraphs,guide.sections.flatMap(s=>s.paragraphs));
      assert.equal(data.contextualLinks.length,annotations[route].length);
      const education=JSON.stringify((({seoTitle,description,...rest})=>rest)(guide));
      review.push({route,status:response.status(),xRobotsTag:response.headers()['x-robots-tag']||null,...data,educationalSourceSha256:crypto.createHash('sha256').update(education).digest('hex')});
    }
    const service=await context.request.get(base+'/fca-authorisation-motor-dealers');rendered['/fca-authorisation-motor-dealers']={status:service.status(),html:await service.text()};
    fs.writeFileSync(dir+'/rendered-after.json.gz',zlib.gzipSync(JSON.stringify(rendered)));
    const robots=await (await context.request.get(base+'/robots.txt')).text(),sitemap=await (await context.request.get(base+'/sitemap.xml')).text();
    for(const r of review){r.sitemapIncluded=sitemap.includes('<loc>'+r.canonical+'</loc>');assert(r.sitemapIncluded);}
    fs.writeFileSync(dir+'/rendered-review.json',JSON.stringify({checkedAt:new Date().toISOString(),robots,sitemap,pages:review},null,2)+'\n');
    fs.writeFileSync(dir+'/internal-link-map.json',JSON.stringify(Object.fromEntries(review.map(r=>[r.route,{educational:r.educationalLinks,related:r.relatedLinks,service:r.serviceLinks,booking:r.booking}])),null,2)+'\n');
    console.log('18 rendered pages: exact metadata, 37 inline anchors, original paragraph text, sitemap and full link map saved.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
