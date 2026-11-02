'use strict';
const path=require('node:path'),{randomUUID}=require('node:crypto'),{createInterface}=require('node:readline/promises'),{Writable}=require('node:stream');
const root=path.resolve(__dirname,'..');
const {settings}=require('../runtime/settings.cjs'),{openDatabase,initialize}=require('../runtime/storage.cjs');
async function main(){
 require('dotenv').config({path:path.resolve(root,'../.env')});
 const opts=settings(root),db=await openDatabase(opts.dbFile);let rl,mute=false;
 const output=new Writable({write(chunk,encoding,callback){if(!mute)process.stdout.write(chunk,encoding);callback();}});
 async function question(prompt,secret=false){if(!rl)rl=createInterface({input:process.stdin,output,terminal:!!process.stdin.isTTY});if(!secret)return(await rl.question(prompt)).trim();process.stdout.write(prompt);mute=true;try{return await rl.question('');}finally{mute=false;process.stdout.write('\n');}}
 try{
  await initialize(db,root);const reset=process.argv.includes('--reset');
  let input;
  if(process.argv.includes('--stdin')){let value='';for await(const chunk of process.stdin){value+=chunk;if(value.length>8192)throw Error('Input too large');}input=JSON.parse(value);}
  else{console.log(reset?'Reset staff password (sessions will be revoked).':'Create a staff account. Password input is hidden.');input={email:await question('Email: '),name:reset?'':await question('Display name: '),password:await question('Password (15–128 characters): ',true)};if(input.password!==await question('Confirm password: ',true))throw Error('Passwords do not match.');}
  const email=String(input.email||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw Error('Enter a valid email address.');
  const {hashPassword}=await import('../source/lib/password.mjs');const hash=await hashPassword(input.password);
  const existing=await db.prepare('SELECT id FROM portal_accounts WHERE email=?').bind(email).first();
  if(reset){if(!existing)throw Error('Account not found.');await db.batch([db.prepare('UPDATE portal_accounts SET password_hash=? WHERE id=?').bind(hash,existing.id),db.prepare('DELETE FROM portal_sessions WHERE account_id=?').bind(existing.id)]);console.log('Password reset. All existing sessions revoked.');}
  else{
   if(existing)throw Error('Account exists. Use --reset if you need to reset its password.');
   const name=String(input.name||'').trim();if(!name||name.length>120)throw Error('Enter a display name up to 120 characters.');
   const records=(await db.prepare('SELECT owner FROM records').all()).results;let owner=input.ownerId;
   if(owner===undefined&&records.length){if(process.argv.includes('--stdin'))throw Error('Existing records found. Supply ownerId explicitly, or an empty string to create an empty workspace.');console.log('Existing workspace IDs: '+records.map(r=>r.owner).join(', '));owner=await question('Workspace ID to link (blank for new workspace): ');}
   owner=owner||randomUUID();if(typeof owner!=='string'||owner.length>160||/[\x00-\x1f]/.test(owner))throw Error('Invalid workspace ID.');
   const first=!await db.prepare("SELECT id FROM portal_accounts WHERE role='owner'").first();
   await db.prepare('INSERT INTO portal_accounts(id,email,name,password_hash,role,created) VALUES(?,?,?,?,?,?)').bind(owner,email,name,hash,first?'owner':'staff',Date.now()).run();
   console.log('Account created.'+(first?' This account receives website call bookings.':''));
  }
  console.log('Sign in at '+opts.origin);
 }finally{rl?.close();await db.close();}
}
main().catch(e=>{console.error('Account setup failed: '+e.message);process.exitCode=1;});
