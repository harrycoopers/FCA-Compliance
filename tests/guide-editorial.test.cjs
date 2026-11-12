'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {guideText}=require('../utils/guide-editorial');
test('guide punctuation preserves ranges, reference spans, meaningful compounds and unknown identifiers',()=>{
 const protectedText='January–June; 1 January–31 December; Note 12(f)–(i); four-/ten-month; non-real-time; pre-contractual; -5; FCA-XYZ-123; --';
 assert.equal(guideText(protectedText),protectedText);
 assert.equal(guideText('FCA Handbook: SUP 12.2 — appointed representatives'),'FCA Handbook: SUP 12.2: appointed representatives');
 assert.equal(guideText('regulated activities—not simply the size'),'regulated activities, not simply the size');
 assert.equal(guideText('Six-month term; 15-minute meeting; third-party finance'),'Six month term; 15 minute meeting; third party finance');
});
test('guide display formatting leaves every word and number unchanged and does not mutate source data',()=>{
 const guides=require('../config/guide-content.json'),before=JSON.stringify(guides);
 const words=s=>s.match(/[\p{L}\p{N}]+/gu)||[];
 function check(value){if(typeof value==='string'){assert.deepEqual(words(guideText(value)),words(value));assert.equal(guideText(guideText(value)),guideText(value));}else if(value&&typeof value==='object')Object.values(value).forEach(check);}
 check(guides);assert.equal(JSON.stringify(guides),before);
});
