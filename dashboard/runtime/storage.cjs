'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
// sqlite3 is already installed by the public website. Never open its customer DB here.
const sqlite3=require('sqlite3');
async function openDatabase(file){
 await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});
 // Keep generated staff records and document blobs out of accidental Git commits.
 await fs.writeFile(path.join(path.dirname(file),'.gitignore'),'*\n!.gitignore\n',{flag:'wx',mode:0o600}).catch(e=>{if(e.code!=='EEXIST')throw e;});
 const raw=await new Promise((resolve,reject)=>{const db=new sqlite3.Database(file,e=>e?reject(e):resolve(db));});
 await fs.chmod(file,0o600);
 const exec=sql=>new Promise((resolve,reject)=>raw.exec(sql,e=>e?reject(e):resolve()));
 const all=(sql,args)=>new Promise((resolve,reject)=>raw.all(sql,args,(e,rows)=>e?reject(e):resolve(rows)));
 const run=(sql,args)=>new Promise((resolve,reject)=>raw.run(sql,args,function(e){e?reject(e):resolve({meta:{changes:this.changes,last_row_id:this.lastID}});}));
 let tail=Promise.resolve();
 const enqueue=fn=>{const current=tail.then(fn);tail=current.catch(()=>{});return current;};
 await exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=10000;');
 class Statement{
  constructor(sql,args=[]){this.sql=sql;this.args=args;}
  bind(...args){return new Statement(this.sql,args);}
  first(column){return enqueue(async()=>{const row=(await all(this.sql,this.args))[0];return row?(column?row[column]:row):null;});}
  all(){return enqueue(async()=>({results:await all(this.sql,this.args)}));}
  run(){return enqueue(()=>run(this.sql,this.args));}
 }
 return {prepare:sql=>new Statement(sql),exec:sql=>enqueue(()=>exec(sql)),
  batch:statements=>enqueue(async()=>{await exec('BEGIN IMMEDIATE');try{const results=[];for(const s of statements)results.push(await run(s.sql,s.args));await exec('COMMIT');return results;}catch(e){await exec('ROLLBACK');throw e;}}),
  close:()=>enqueue(()=>new Promise((resolve,reject)=>raw.close(e=>e?reject(e):resolve())))};
}
async function initialize(db,root){
 for(const file of (await fs.readdir(path.join(root,'source/drizzle'))).filter(x=>x.endsWith('.sql')).sort()){
  const sql=(await fs.readFile(path.join(root,'source/drizzle',file),'utf8')).replaceAll('--> statement-breakpoint','').replace(/CREATE TABLE (?!IF NOT EXISTS)/g,'CREATE TABLE IF NOT EXISTS ').replace(/CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/g,(_,u)=>'CREATE '+(u||'')+'INDEX IF NOT EXISTS ');
  await db.exec(sql);
 }
}
function fileBucket(root){
 // Hash keys: no object key can escape the private storage directory.
 const location=key=>{if(typeof key!=='string'||!key||key.length>1024)throw Error('Invalid document key');return path.join(root,crypto.createHash('sha256').update(key).digest('hex'));};
 return {
  async put(key,value){await fs.mkdir(root,{recursive:true,mode:0o700});const target=location(key),temp=target+'.'+crypto.randomUUID()+'.tmp';try{await fs.writeFile(temp,value,{mode:0o600,flag:'wx'});await fs.rename(temp,target);}finally{await fs.rm(temp,{force:true});}},
  async get(key){try{const value=await fs.readFile(location(key));return {body:new Uint8Array(value),arrayBuffer:async()=>value.buffer.slice(value.byteOffset,value.byteOffset+value.byteLength)};}catch(e){if(e.code==='ENOENT')return null;throw e;}},
  async delete(key){await fs.rm(location(key),{force:true});}
 };
}
module.exports={openDatabase,initialize,fileBucket};
