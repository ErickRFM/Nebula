import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBridgeServer} from './bridge-core.mjs';
import {MAX_PLAYLIST_TRACKS} from './limits.mjs';
import {sanitizeYouTubeUrl} from './url-policy.mjs';

const secret='test-batch-token-very-long-1234567890';
const origin='https://nebula.example.test';
const listUrl='https://www.youtube.com/playlist?list=PL'+('a'.repeat(30));
const id=n=>String(n).padStart(11,'0');
const entry=n=>({id:id(n),title:'Tema '+n,artist:'Canal',durationSeconds:120,sourceUrl:'https://www.youtube.com/watch?v='+id(n)});

async function setup(runner,clock=()=>Date.now()){
 const folder=await mkdtemp(join(tmpdir(),'nebula-batch-'));
 const bridge=createBridgeServer({runner,secret,port:0,origins:[origin],clock,downloadDir:folder});
 const address=await bridge.listen();
 return {folder,bridge,base:'http://127.0.0.1:'+address.port,headers:{Origin:origin,Authorization:'Bearer '+secret},
  close:async()=>{await bridge.close();await rm(folder,{recursive:true,force:true});}};
}
function fakeRunner({count=MAX_PLAYLIST_TRACKS,onDownload,slow=false}={}){
 const downloaded=[];
 return {downloaded,runner:{
  enabled:true,
  search:async()=>[],
  stream(){throw Error('unused');},
  async resolve(url){
   if(!sanitizeYouTubeUrl(url))throw Error('invalid_url');
   return {items:Array.from({length:count},(_,n)=>entry(n)),truncated:false};
  },
  downloadOne(videoId,{directory,signal}={}){
   if(typeof directory!=='string')throw Error('missing_directory');
   if(!slow)return Promise.resolve().then(()=>{downloaded.push(videoId);});
   downloaded.push(videoId);
   return new Promise(resolve=>{if(onDownload)onDownload(downloaded.length);signal.addEventListener('abort',()=>resolve(),{once:true});});
  },
 }};
}
async function eventually(check){
 for(let attempt=0;attempt<200;attempt++){
  if(await check())return true;
  await new Promise(resolve=>setTimeout(resolve,10));
 }
 throw Error('batch never reached the expected state');
}
async function resolveList(ctx){
 return fetch(ctx.base+'/resolve?url='+encodeURIComponent(listUrl),{headers:ctx.headers});
}

test('a batch only accepts ids the bridge just listed for that same link',async()=>{
 const {runner,downloaded}=fakeRunner({count:3});
 const ctx=await setup(runner);
 try{
  assert.equal((await fetch(ctx.base+'/batch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({listUrl,ids:[id(0)]})})).status,401);
  assert.equal((await resolveList(ctx)).status,200);
  assert.equal((await fetch(ctx.base+'/batch',{method:'POST',headers:{...ctx.headers,'Content-Type':'application/json'},body:JSON.stringify({listUrl:'https://www.youtube.com/watch?v='+id(0),ids:[id(0)]})})).status,410);
  assert.equal((await fetch(ctx.base+'/batch',{method:'POST',headers:{...ctx.headers,'Content-Type':'application/json'},body:JSON.stringify({listUrl,ids:['notinlist']})})).status,400);
  assert.equal((await fetch(ctx.base+'/batch',{method:'POST',headers:{...ctx.headers,'Content-Type':'application/json'},body:JSON.stringify({listUrl,ids:[id(1),id(1)]})})).status,400);
  assert.equal((await fetch(ctx.base+'/batch',{method:'POST',headers:{...ctx.headers,'Content-Type':'application/json'},body:JSON.stringify({listUrl,ids:[]})})).status,400);
  const started=await fetch(ctx.base+'/batch',{method:'POST',headers:{...ctx.headers,'Content-Type':'application/json'},body:JSON.stringify({listUrl,ids:[id(0),id(1),id(2)]})});
  assert.equal(started.status,202);
  const {job}=await started.json();
  assert.equal(job.total,3);
  assert.match(job.destination,new RegExp('nebula-batch'));
  assert.match(job.id,/^[0-9a-f-]{36}$/);
  await eventually(async()=>(await (await fetch(ctx.base+'/batch/'+job.id,{headers:ctx.headers})).json()).job.status==='completed');
  assert.deepEqual(downloaded,[id(0),id(1),id(2)]);
 }finally{await ctx.close();}
});

test('a full batch keeps its source order and reports every file it wrote',async()=>{
 const {runner,downloaded}=fakeRunner();
 const ctx=await setup(runner);
 try{
  await resolveList(ctx);
  const ids=Array.from({length:MAX_PLAYLIST_TRACKS},(_,n)=>id(n));
  const started=await fetch(ctx.base+'/batch',{method:'POST',headers:{...ctx.headers,'Content-Type':'application/json'},
   body:JSON.stringify({listUrl,ids:[...ids].reverse()})});
  assert.equal(started.status,202);
  const {job}=await started.json();
  assert.equal(job.total,MAX_PLAYLIST_TRACKS);
  await eventually(async()=>(await (await fetch(ctx.base+'/batch/'+job.id,{headers:ctx.headers})).json()).job.completed===MAX_PLAYLIST_TRACKS);
  const state=(await (await fetch(ctx.base+'/batch/'+job.id,{headers:ctx.headers})).json()).job;
  assert.equal(state.saved,MAX_PLAYLIST_TRACKS);
  assert.equal(state.failed,0);
  assert.equal(state.status,'completed');
  assert.equal(downloaded[0],[...ids].reverse()[0]);
  assert.equal(downloaded[MAX_PLAYLIST_TRACKS-1],id(0));
 }finally{await ctx.close();}
});

test('cancel stops the current song and never starts the next one',async()=>{
 const {runner,downloaded}=fakeRunner({count:3,slow:true});
 const ctx=await setup(runner);
 try{
  await resolveList(ctx);
  const started=await fetch(ctx.base+'/batch',{method:'POST',headers:{...ctx.headers,'Content-Type':'application/json'},body:JSON.stringify({listUrl,ids:[id(0),id(1),id(2)]})});
  const {job}=await started.json();
  await eventually(async()=>downloaded.length===1);
  const busy=await fetch(ctx.base+'/batch',{method:'POST',headers:{...ctx.headers,'Content-Type':'application/json'},body:JSON.stringify({listUrl,ids:[id(1)]})});
  assert.equal(busy.status,409);
  const stop=await fetch(ctx.base+'/batch/'+job.id+'/cancel',{method:'POST',headers:ctx.headers});
  assert.equal(stop.status,200);
  assert.equal((await stop.json()).job.status,'cancelled');
  await new Promise(resolve=>setTimeout(resolve,40));
  assert.equal(downloaded.length,1);
  const state=(await (await fetch(ctx.base+'/batch/'+job.id,{headers:ctx.headers})).json()).job;
  assert.equal(state.status,'cancelled');
  assert.equal(state.completed,0);
 }finally{await ctx.close();}
});

test('an expired preview and an unknown job are refused without touching the runner',async()=>{
 let now=Date.now();
 const {runner,downloaded}=fakeRunner({count:2});
 const ctx=await setup(runner,()=>now);
 try{
  await resolveList(ctx);
  now+=21*60_000;
  const expired=await fetch(ctx.base+'/batch',{method:'POST',headers:{...ctx.headers,'Content-Type':'application/json'},body:JSON.stringify({listUrl,ids:[id(0)]})});
  assert.equal(expired.status,410);
  assert.equal(downloaded.length,0);
  const missing=await fetch(ctx.base+'/batch/11111111-1111-4111-8111-111111111111',{headers:ctx.headers});
  assert.equal(missing.status,404);
  const evil=await fetch(ctx.base+'/batch/..%2F..%2Fetc',{headers:ctx.headers});
  assert.equal(evil.status,404);
 }finally{await ctx.close();}
});

test('a bridge without a disk downloader answers 503 instead of pretending success',async()=>{
 const ctx=await setup({enabled:true,search:async()=>[],stream(){throw Error('unused');},
  async resolve(){return {items:[entry(0)],truncated:false};}});
 try{
  assert.equal((await resolveList(ctx)).status,200);
  const res=await fetch(ctx.base+'/batch',{method:'POST',headers:{...ctx.headers,'Content-Type':'application/json'},body:JSON.stringify({listUrl,ids:[id(0)]})});
  assert.equal(res.status,503);
  assert.equal((await res.json()).error,'batch_unavailable');
 }finally{await ctx.close();}
});

test('closing the bridge aborts the song in flight and starts no other',async()=>{
 const {runner,downloaded}=fakeRunner({count:2,slow:true});
 const folder=await mkdtemp(join(tmpdir(),'nebula-batch-'));
 const bridge=createBridgeServer({runner,secret,port:0,origins:[origin],downloadDir:folder});
 const address=await bridge.listen();
 const base='http://127.0.0.1:'+address.port;
 const headers={Origin:origin,Authorization:'Bearer '+secret};
 try{
  await fetch(base+'/resolve?url='+encodeURIComponent(listUrl),{headers});
  await fetch(base+'/batch',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({listUrl,ids:[id(0),id(1)]})});
  await eventually(async()=>downloaded.length===1);
  await bridge.close();
  await new Promise(resolve=>setTimeout(resolve,60));
  assert.equal(downloaded.length,1);
 }finally{await rm(folder,{recursive:true,force:true});}
});
