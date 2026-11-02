'use strict';
// Offline, one-time import. Reads a temporary copy using SQLite and the filesystem.
// No emulator, Cloudflare SDK, network request or old dependencies are used.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{randomUUID}=require('node:crypto');
const {settings}=require('../runtime/settings.cjs'),{openDatabase,initialize,fileBucket}=require('../runtime/storage.cjs');
const sqlite=require('sqlite3');
async function files(root){const found=[];for(const e of await fs.readdir(root,{withFileTypes:true})){const p=path.join(root,e.name);if(e.isSymbolicLink())throw Error('Symbolic links in old storage are not supported.');if(e.isDirectory())found.push(...await files(p));else if(e.isFile())found.push(p);}return found;}
async function readonly(file){const db=await new Promise((resolve,reject)=>{const d=new sqlite.Database(file,sqlite.OPEN_READONLY,e=>e?reject(e):resolve(d));});return {all:(sql,args=[])=>new Promise((resolve,reject)=>db.all(sql,args,(e,r)=>e?reject(e):resolve(r))),close:()=>new Promise((resolve,reject)=>db.close(e=>e?reject(e):resolve()))};}
const tables=['records','devices','deliveries','document_templates','generated_documents','portal_accounts','meeting_cache'];
async function importLocal(oldRoot,root,env=process.env){
 oldRoot=path.resolve(oldRoot);const opts=settings(root,env);
 if(await fs.stat(opts.dataDir).then(()=>true,()=>false))throw Error('Destination already exists. Import only into a new DASHBOARD_DATA_DIR; existing data will never be overwritten.');
 const state=path.join(oldRoot,'.wrangler/state/v3');await fs.access(state);
 const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'009-dashboard-import-'));const stage=opts.dataDir+'.import-'+randomUUID();let db;const opened=[];
 try{
  await fs.cp(state,path.join(temporary,'v3'),{recursive:true});
  const snapshot=path.join(temporary,'v3'),allFiles=await files(snapshot),candidates=[],buckets=[];
  for(const file of allFiles.filter(p=>p.endsWith('.sqlite'))){
   const connection=await readonly(file);opened.push(connection);
   const names=(await connection.all("SELECT name FROM sqlite_master WHERE type='table'")).map(x=>x.name);
   if(names.includes('records'))candidates.push({connection,names});
   if(names.includes('_mf_objects'))buckets.push(connection);
  }
  if(candidates.length!==1)throw Error('Expected exactly one local dashboard database. Import aborted to avoid selecting the wrong records.');
  const oldDb=candidates[0].connection,existing=candidates[0].names;
  async function documentBytes(key){
   const matches=[];for(const connection of buckets)for(const object of await connection.all('SELECT key,blob_id,size FROM _mf_objects WHERE key=?',[key]))matches.push({connection,object});
   if(matches.length!==1)throw Error('Missing or ambiguous saved document. Import aborted.');
   const {connection,object}=matches[0];
   const parts=object.blob_id?[{blob_id:object.blob_id}]:await connection.all('SELECT blob_id FROM _mf_multipart_parts WHERE object_key=? ORDER BY part_number',[key]);
   const buffers=[];for(const part of parts){
    if(!/^[a-f0-9]{80}$/.test(part.blob_id))throw Error('Unsupported old document identifier.');
    const locations=allFiles.filter(p=>path.basename(p)===part.blob_id&&path.basename(path.dirname(p))==='blobs');
    if(locations.length!==1)throw Error('Saved document bytes are missing or ambiguous.');
    const stat=await fs.stat(locations[0]);if(stat.size>32*1024*1024)throw Error('Old document exceeds the supported import size.');
    buffers.push(await fs.readFile(locations[0]));
   }
   const bytes=Buffer.concat(buffers);if(bytes.length!==object.size)throw Error('Old document size mismatch. Import aborted.');return bytes;
  }
  if(!existing.includes('records'))throw Error('No dashboard records table found. Check the old project path and local configuration.');
  const rows={};for(const table of tables)rows[table]=existing.includes(table)?await oldDb.all('SELECT * FROM '+table):[];
  if(!rows.records.length&&!rows.portal_accounts.length)throw Error('The selected local database contains no saved accounts or workspaces. Nothing imported.');
  db=await openDatabase(path.join(stage,'staff.sqlite'));await initialize(db,root);
  await db.exec('CREATE TABLE IF NOT EXISTS meeting_cache(owner TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(owner,id))');
  const bucket=fileBucket(path.join(stage,'documents'));
  let documents=0;
  for(const row of [...rows.document_templates,...rows.generated_documents]){
   const bytes=await documentBytes(row.blob_key);await bucket.put(row.blob_key,bytes);documents++;
  }
  const statements=[];
  for(const table of tables){
   const columns=(await db.prepare('PRAGMA table_info('+table+')').all()).results.map(x=>x.name);
   for(const row of rows[table]){
    // Browser subscriptions are scoped to the OLD origin. Retain history, but
    // require the owner to enable notifications again on the new dashboard.
    if(table==='devices')row.enabled=0;
    if(table==='deliveries'&&row.state==='sending')row.state='failed';
    statements.push(db.prepare('INSERT INTO '+table+' ('+columns.join(',')+') VALUES ('+columns.map(()=>'?').join(',')+')').bind(...columns.map(c=>row[c]??null)));
   }
  }
  await db.batch(statements);await db.close();db=null;
  await fs.mkdir(path.dirname(opts.dataDir),{recursive:true});
  if(await fs.stat(opts.dataDir).then(()=>true,()=>false))throw Error('Destination appeared during import. Nothing overwritten.');
  await fs.rename(stage,opts.dataDir);
  return {accounts:rows.portal_accounts.length,workspaces:rows.records.length,documents};
 }finally{if(db)await db.close();for(const connection of opened)await connection.close();await fs.rm(temporary,{recursive:true,force:true});await fs.rm(stage,{recursive:true,force:true});}
}
if(require.main===module){const root=path.resolve(__dirname,'..');require('dotenv').config({path:path.resolve(root,'../.env')});const old=process.argv[2];if(!old){console.error('Usage: node dashboard/scripts/import-local.cjs /absolute/path/to/OLD-dashboard');process.exitCode=1;}else importLocal(old,root).then(r=>console.log('Imported '+r.accounts+' accounts, '+r.workspaces+' workspaces and '+r.documents+' documents. Sign in again and re-enable device notifications.')).catch(e=>{console.error('Import failed: '+e.message);process.exitCode=1;});}
module.exports={importLocal};
