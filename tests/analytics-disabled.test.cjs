'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const script=fs.readFileSync(require('node:path').join(__dirname,'../public/js/analytics-disabled.js'),'utf8');
test('old acceptance cannot enable analytics; only queued guide events and retired preference are removed',()=>{
  const storage=new Map([['009.analytics-consent.v1','accepted'],['essential-preference','keep']]);
  const unrelated={event:'unrelated-integration'},config=['config','G-BMQFTHWWKP'];
  const queue=[['event','guide_offer_click'],unrelated,{event:'guide_booking_cta_click'},config];
  const window={dataLayer:queue};let reads=0;
  vm.runInNewContext(script,{window,localStorage:{getItem(){reads++;throw Error('Preference must never activate tracking');},removeItem:k=>storage.delete(k)}});
  assert.equal(window['ga-disable-G-BMQFTHWWKP'],true);assert.equal(reads,0);
  assert.strictEqual(window.dataLayer,queue);assert.deepEqual(queue,[unrelated,config]);
  window.gtag('event','guide_offer_click');window.gtag('config','G-BMQFTHWWKP');assert.deepEqual(queue,[unrelated,config]);
  assert(!storage.has('009.analytics-consent.v1'));assert.equal(storage.get('essential-preference'),'keep');
});
test('analytics remains disabled when storage is unavailable and no queue exists',()=>{
  const window={};vm.runInNewContext(script,{window,localStorage:{removeItem(){throw Error('Storage blocked');}}});
  assert.equal(window['ga-disable-G-BMQFTHWWKP'],true);assert.equal(window.dataLayer,undefined);assert.doesNotThrow(()=>window.gtag('event','test'));
});
