'use strict';
const esbuild=require('esbuild'),fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'..');
async function build(){
 await fs.rm(path.join(root,'dist'),{recursive:true,force:true});await fs.mkdir(path.join(root,'dist/client/assets'),{recursive:true});
 const shared={absWorkingDir:root,bundle:true,metafile:true,logLevel:'info',legalComments:'linked',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}};
 const server=await esbuild.build({...shared,entryPoints:['runtime/server.ts'],platform:'node',target:'node22',format:'cjs',outfile:'dist/server.cjs',external:['express','../runtime/storage.cjs','../runtime/settings.cjs']});
 const client=await esbuild.build({...shared,entryPoints:['source/client.tsx'],platform:'browser',target:['safari16','chrome109'],format:'esm',minify:true,outfile:'dist/client/assets/app.js'});
 const licenses=new Map();
 for(const input of new Set([...Object.keys(server.metafile.inputs),...Object.keys(client.metafile.inputs)])){
  if(!input.includes('node_modules/'))continue;
  let dir=path.dirname(path.resolve(root,input));
  while(dir!==path.dirname(dir)){
   let pkg;try{pkg=JSON.parse(await fs.readFile(path.join(dir,'package.json'),'utf8'));}catch{}
   if(pkg){const id=pkg.name+'@'+pkg.version;if(!licenses.has(id)){const files=(await fs.readdir(dir)).filter(f=>/^(licen[sc]e|copying)(\.|$)/i.test(f));const notices=[];for(const file of files){try{notices.push(await fs.readFile(path.join(dir,file),'utf8'));}catch{}}licenses.set(id,notices.join('\n')||'License: '+pkg.license);}break;}
   dir=path.dirname(dir);
  }
 }
 await fs.writeFile(path.join(root,'THIRD-PARTY-LICENSES.txt'),[...licenses].sort(([a],[b])=>a.localeCompare(b)).map(([name,license])=>name+'\n'+'='.repeat(name.length)+'\n'+license).join('\n\n'));
 await fs.cp(path.join(root,'source/public'),path.join(root,'dist/client'),{recursive:true});
 await fs.writeFile(path.join(root,'dist/client/index.html'),'<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#14243A"><meta name="apple-mobile-web-app-capable" content="yes"><title>009 Compliance · Staff dashboard</title><meta name="description" content="Private 009 Compliance dashboard for companies, returns, calls and documents."><link rel="icon" href="/favicon.svg"><link rel="apple-touch-icon" href="/009-logo-transparent.png"><link rel="manifest" href="/manifest.json"><link rel="stylesheet" href="/assets/app.css"></head><body><div id="app"><!--LOGIN--></div><noscript>Please enable JavaScript to use the staff dashboard.</noscript><script type="module" src="/assets/app.js"></script></body></html>');
}
build().catch(e=>{console.error(e);process.exitCode=1;});
