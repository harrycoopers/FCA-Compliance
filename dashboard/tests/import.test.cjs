'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {openDatabase,initialize,fileBucket}=require('../runtime/storage.cjs'),{importLocal}=require('../scripts/import-local.cjs'),{settings}=require('../runtime/settings.cjs');
const root=path.resolve(__dirname,'..');
test('offline migration retains accounts, records and documents; revokes sessions; refuses overwrite or missing files',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'009-import-test-')),old=path.join(temp,'old'),state=path.join(old,'.wrangler/state/v3'),source=path.join(state,'d1/miniflare-D1DatabaseObject/source.sqlite');
 let db=await openDatabase(source);await initialize(db,root);
 const {hashPassword}=await import('../source/lib/password.mjs'),hash=await hashPassword('Migration isolated password 2026');
 await db.prepare('INSERT INTO portal_accounts(id,email,name,password_hash,role,created) VALUES(?,?,?,?,?,?)').bind('owner','qa@example.invalid','QA',hash,'owner',Date.now()).run();
 await db.prepare('INSERT INTO records VALUES(?,?,?)').bind('owner',JSON.stringify({companies:[{name:'Preserved QA company'}],returns:[],activity:[],settings:{}}),9).run();
 await db.prepare('INSERT INTO portal_sessions VALUES(?,?,?)').bind('a'.repeat(64),'owner',0).run();
 await db.prepare('INSERT INTO devices VALUES(?,?,?,?,?)').bind('old-device','owner','QA','{}',1).run();
 const key='documents/owner/templates/test.docx',bytes=Buffer.from('Isolated document bytes'),blobId='b'.repeat(80);
 await db.prepare('INSERT INTO document_templates VALUES(?,?,?,?,?,?,?,?,?,?)').bind('template','owner','QA template','qa.docx',key,'v1','{}','{}',1,'2026-11-01').run();await db.close();db=null;
 const metadata=await openDatabase(path.join(state,'r2/miniflare-R2BucketObject/bucket.sqlite'));
 await metadata.exec('CREATE TABLE _mf_objects(key TEXT PRIMARY KEY,blob_id TEXT,size INTEGER)');await metadata.prepare('INSERT INTO _mf_objects VALUES(?,?,?)').bind(key,blobId,bytes.length).run();await metadata.close();
 const blobs=path.join(state,'r2/site-creator-r2/blobs');await fs.mkdir(blobs,{recursive:true});await fs.writeFile(path.join(blobs,blobId),bytes);
 const before=crypto.createHash('sha256').update(await fs.readFile(source)).digest('hex');
 try{
  const target=path.join(temp,'destination');const result=await importLocal(old,root,{DASHBOARD_DATA_DIR:target});assert.deepEqual(result,{accounts:1,workspaces:1,documents:1});
  db=await openDatabase(path.join(target,'staff.sqlite'));assert.equal((await db.prepare('SELECT password_hash FROM portal_accounts').first()).password_hash,hash);assert.equal((await db.prepare('SELECT revision FROM records').first()).revision,9);assert.equal((await db.prepare('SELECT count(*) AS n FROM portal_sessions').first()).n,0);assert.equal((await db.prepare('SELECT enabled FROM devices').first()).enabled,0);await db.close();db=null;
  assert.deepEqual(Buffer.from(await(await fileBucket(path.join(target,'documents')).get(key)).arrayBuffer()),bytes);
  await assert.rejects(importLocal(old,root,{DASHBOARD_DATA_DIR:target}),/already exists/);
  assert.equal(crypto.createHash('sha256').update(await fs.readFile(source)).digest('hex'),before);
  await fs.rm(path.join(blobs,blobId));const failed=path.join(temp,'missing-file-target');await assert.rejects(importLocal(old,root,{DASHBOARD_DATA_DIR:failed}),/missing/);assert.equal(await fs.stat(failed).then(()=>true,()=>false),false);
 }finally{if(db)await db.close();await fs.rm(temp,{recursive:true,force:true});}
});
test('production configuration rejects unsafe origins and publicly served storage',()=>{
 for(const origin of ['http://dashboard.009compliance.com','https://user:pass@example.com','https://example.com/path'])assert.throws(()=>settings(root,{NODE_ENV:'production',PORTAL_ORIGIN:origin,DASHBOARD_DATA_DIR:'/var/data/staff'}));
 assert.throws(()=>settings(root,{NODE_ENV:'production'}),/persistent disk/);
 assert.throws(()=>settings(root,{DASHBOARD_DATA_DIR:path.join(root,'public-data')}),/outside/);
 assert.throws(()=>settings(root,{DASHBOARD_DATA_DIR:path.resolve(root,'../public/staff')}),/outside/);
 assert.equal(settings(root,{NODE_ENV:'production',DASHBOARD_DATA_DIR:'/var/data/staff'}).origin,'https://dashboard.009compliance.com');
});
