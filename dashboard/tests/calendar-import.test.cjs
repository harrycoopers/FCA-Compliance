'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),esbuild=require('esbuild'),vm=require('node:vm');
const built=esbuild.buildSync({entryPoints:[require('node:path').join(__dirname,'../source/lib/calendar-import.ts')],bundle:true,platform:'node',format:'cjs',write:false});
const sandbox={module:{exports:{}},exports:{},require,crypto:require('node:crypto').webcrypto,structuredClone,console};vm.runInNewContext(built.outputFiles[0].text,sandbox);const {parseCalendarImport,defaultMappings,mergeCalendarImport}=sandbox.module.exports;
const empty=()=>({companies:[],returns:[],activity:[],settings:{brand:'009 Compliance',name:'QA',timezone:'Europe/London',reminderTime:'09:00',offsets:[30,7,1],privacy:false}});
const entry=(id,due='2027-01-11')=>({id,title:'SAF test',due,sourceText:'SAF test due',sourceParagraph:1,review:''});
const fixture=()=>({format:'009-calendar-import-v1',source:'QA.docx',sourceSha256:'a'.repeat(64),sourceParagraphs:['QA only'],groups:[{id:'one',name:'QA Motors Ltd',sourceNames:['QA Motors Ltd'],section:'QA',review:'',entries:[entry('dated'),entry('undated',null)]},{id:'two',name:'QA Motors Limited',sourceNames:['QA Motors Limited'],section:'QA',review:'',entries:[entry('dated2','2027-02-11')]}]});
test('imports preserve existing data, merge exact company names, keep missing dates and are idempotent',()=>{
 const data=empty(),doc=parseCalendarImport(fixture());data.companies.push({id:'existing',name:'QA Motors Ltd',contact:'Known person',email:'qa@example.invalid',notes:'Keep',archived:false});
 const result=mergeCalendarImport(data,doc,defaultMappings(doc,data));assert.equal(result.added,2);assert.equal(result.pending,1);assert.equal(result.data.companies.length,1);assert.equal(result.data.companies[0].notes,'Keep');assert.equal(result.data.returns[0].companyId,'existing');assert.equal(result.data.returns[0].recurrence,0);assert.equal(result.data.returns[0].status,'Not started');assert.equal(data.returns.length,0);
 result.data.returns[0].due='2028-01-11';const twice=mergeCalendarImport(result.data,doc,defaultMappings(doc,result.data));assert.equal(twice.added,0);assert.equal(twice.pending,0);assert.equal(twice.data.returns[0].due,'2028-01-11');
});
test('ambiguous companies require an explicit choice; invalid dates and duplicate IDs fail',()=>{
 const input=fixture();input.groups[0].sourceNames.push('A different company');let doc=parseCalendarImport(input),data=empty(),map=defaultMappings(doc,data);assert.equal(map.one,'');assert.throws(()=>mergeCalendarImport(data,doc,map),/Confirm/);map.one='new:one';assert.equal(mergeCalendarImport(data,doc,map).added,2);
 input.groups[0].entries[0].due='2027-02-30';assert.throws(()=>parseCalendarImport(input));input.groups[0].entries[0].due='2027-02-01';input.groups[0].entries[1].id='dated';assert.throws(()=>parseCalendarImport(input),/Duplicate/);
});
if(process.env.CALENDAR_IMPORT_FIXTURE)test('complete supplied document imports every dated and undated item exactly once',()=>{
 const doc=parseCalendarImport(JSON.parse(require('node:fs').readFileSync(process.env.CALENDAR_IMPORT_FIXTURE,'utf8'))),data=empty(),mappings=defaultMappings(doc,data);
 // Explicit isolated-test choice for the two ambiguous headings, not an automatic production mapping.
 for(const group of doc.groups)if(!mappings[group.id])mappings[group.id]='new:'+group.id;
 const result=mergeCalendarImport(data,doc,mappings);assert.equal(result.added,174);assert.equal(result.pending,2);
 for(const group of doc.groups)for(const entry of group.entries){const row=entry.due?result.data.returns.find(r=>r.id===entry.id):result.data.pendingDeadlines.find(r=>r.id===entry.id);assert(row,entry.id);if(entry.due)assert.equal(row.due,entry.due);assert(row.notes.includes(entry.sourceText));assert(row.notes.includes(group.sourceNames.join(' / ')));}
 const again=defaultMappings(doc,result.data);for(const group of doc.groups)if(!again[group.id])again[group.id]=mappings[group.id];
 const repeat=mergeCalendarImport(result.data,doc,again);assert.equal(repeat.added,0);assert.equal(repeat.pending,0);assert.equal(repeat.skipped,176);
});
