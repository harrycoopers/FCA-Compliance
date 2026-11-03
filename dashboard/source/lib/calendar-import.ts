import {z} from 'zod';
import {type Data,type Company,type PendingDeadline} from './model';
const text=z.string().max(4000);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>!isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s);
const entry=z.object({id:z.string().min(1).max(150),title:text.min(1),due:date.nullable(),sourceText:text,sourceParagraph:z.number().int().positive(),review:text});
const schema=z.object({format:z.literal('009-calendar-import-v1'),source:text.min(1),sourceSha256:z.string().regex(/^[a-f0-9]{64}$/),sourceParagraphs:z.array(text).max(3000),groups:z.array(z.object({id:text.min(1),name:text.min(1),sourceNames:z.array(text.min(1)).min(1).max(5),section:text,review:text,entries:z.array(entry).min(1).max(100)})).min(1).max(1000)});
export type CalendarImport=z.infer<typeof schema>;
export function parseCalendarImport(input:unknown){const doc=schema.parse(input);const ids=doc.groups.flatMap(g=>g.entries.map(e=>e.id));if(new Set(ids).size!==ids.length||new Set(doc.groups.map(g=>g.id)).size!==doc.groups.length)throw Error('Duplicate import identifiers.');return doc;}
export const companyKey=(name:string)=>name.trim().toLowerCase().replace(/\blimited\b/g,'ltd').replace(/\bltd\b/g,'').replace(/[^a-z0-9]/g,'');
export function defaultMappings(doc:CalendarImport,data:Data){
  const mappings:Record<string,string>={};const first=new Map<string,string>();
  for(const group of doc.groups){
    const key=companyKey(group.name),matches=data.companies.filter(c=>companyKey(c.name)===key);
    if(group.sourceNames.length>1||matches.length>1){mappings[group.id]='';continue;}
    mappings[group.id]=matches.length===1?'existing:'+matches[0].id:first.has(key)?'new:'+first.get(key):'new:'+group.id;
    if(!matches.length&&!first.has(key))first.set(key,group.id);
  }
  return mappings;
}
export function mergeCalendarImport(data:Data,doc:CalendarImport,mappings:Record<string,string>){
  const next=structuredClone(data),seen=new Set(next.calendarImportIds||[]);
  next.pendingDeadlines=next.pendingDeadlines||[];
  let added=0,pending=0,skipped=0;
  function companyFor(groupId:string):Company{
    const choice=mappings[groupId]||'';
    if(choice.startsWith('existing:')){const c=next.companies.find(c=>c.id===choice.slice(9));if(!c)throw Error('Choose an existing company.');return c;}
    if(!choice.startsWith('new:'))throw Error('Confirm the company for every source group before importing.');
    const target=doc.groups.find(g=>g.id===choice.slice(4));if(!target)throw Error('Invalid company selection.');
    const key=companyKey(target.name);
    const matches=next.companies.filter(c=>companyKey(c.name)===key);
    if(matches.length>1)throw Error('More than one company has this name. Select the exact existing company.');
    if(matches.length)return matches[0];
    const c:Company={id:typeof crypto.randomUUID==='function'?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join(''),name:target.name,contact:'',email:'',phone:'',registration:'',fca:'',archived:false,notes:'Added from '+doc.source+'. Contact and registration details were not supplied.'};
    next.companies.push(c);return c;
  }
  for(const group of doc.groups){
    if(!mappings[group.id])throw Error('Confirm the company for '+group.sourceNames.join(' / ')+'.');
    const remaining=group.entries.filter(e=>!seen.has(e.id)&&!next.returns.some(r=>r.id===e.id)&&!next.pendingDeadlines!.some(r=>r.id===e.id));
    skipped+=group.entries.length-remaining.length;
    if(!remaining.length)continue;
    const company=companyFor(group.id);
    for(const e of remaining){
      const notes=[`Source: ${doc.source}, paragraph ${e.sourceParagraph}.`,`Source company heading: ${group.sourceNames.join(' / ')}.`,e.sourceText,group.review,e.review,'Dates retained as supplied; no automatic annual recurrence.'].filter(Boolean).join('\n');
      if(e.due&&next.returns.some(r=>r.companyId===company.id&&r.title.toLowerCase()===e.title.toLowerCase()&&r.due===e.due)){seen.add(e.id);skipped++;continue;}
      const base={id:e.id,companyId:company.id,title:e.title,type:e.title,notes};
      if(e.due){next.returns.push({...base,contact:company.contact,due:e.due,time:'',status:'Not started',offsets:[...next.settings.offsets],recurrence:0,completedAt:'',reference:'',version:'',scheduled:[]});added++;}
      else {next.pendingDeadlines.push(base);pending++;}
      seen.add(e.id);
    }
  }
  next.calendarImportIds=[...seen];
  if(next.returns.length>10000||next.companies.length>5000)throw Error('Workspace capacity would be exceeded.');
  return {data:next,added,pending,skipped};
}
