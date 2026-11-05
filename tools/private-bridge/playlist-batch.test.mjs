import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBridgeServer} from './bridge-core.mjs';
import {normalizePlaylist,createPlaylistBatchManager} from './playlist-batch.mjs';

const secret='test-batch-token-very-long-1234567890';
const listId='PL'+('a'.repeat(30));
const id=n=>String(n).padStart(11,'0');
const origin='https://nebula.example.test';

async function setup(runner){
 const folder=await mkdtemp(join(tmpdir(),'nebula-batch-'));
 const bridge=createBridgeServer({runner,secret,port:0,origins:[origin],downloadDir:folder});
 const address=await bridge.listen();
 const base='http://127.0.0.1:'+address.port;
 const headers={Origin:origin,Authorization:'Bearer '+secret};
 return {folder,bridge,base,headers,close:async()=>{await bridge.close();await rm(folder,{recursive:true,force:true});}};
}
async function eventually(fn){
 for(let attempt=0;attempt<100;attempt++){
  const value=fn();
  if(value)return value;
  await new Promise(resolve=>setTimeout(resolve,10));
 }
 throw Error('batch did not settle');
}
test('playlist preview deduplicates and limits to 1000 in source order',()=>{
 const entries=Array.from({length:1200},(_,index)=>({id:id(index),title:'Track '+index,duration:120}));
 entries.splice(2,0,{...entries[0]});
 const data=normalizePlaylist({title:'Playlist',entries});
 assert.equal(data.items.length,1000);
 assert.equal(data.items[0].id,id(0));
 assert.equal(data.items[1].id,id(1));
 assert.equal(data.items[999].id,id(999));
 assert.equal(data.truncated,true);
});
test('local authenticated playlist preview and selection batch are bounded',async()=>{
 const downloaded=[];
 const runner={enabled:true,search:async()=>[],stream:()=>({}),
  listPlaylist:async()=>({title:'Mis originales',entries:Array.from({length:1000},(_,i)=>({id:id(i),title:'Tema '+i}))}),
  downloadOne:async(videoId)=>{downloaded.push(videoId);},
 };
 const ctx=await setup(runner);
 try{
  const denied=await fetch(ctx.base+'/playlist?list='+listId);
  assert.equal(denied.status,401);
  const badOrigin=await fetch(ctx.base+'/playlist?list='+listId,{headers:{...ctx.headers,Origin:'https://other.test'}});
  assert.equal(badOrigin.status,403);
  const preview=await fetch(ctx.base+'/playlist?list='+listId,{headers:ctx.headers});
  assert.equal(preview.status,200);
  const data=await preview.json();
  assert.equal(data.total,1000);
  assert.equal(data.items[999].id,id(999));
  const invalid=await fetch(ctx.base+'/batch',{
   method:'POST',headers:{...ctx.headers,'Content-Type':'application/json'},
   body:JSON.stringify({listId,ids:[id(1),id(1)]}),
  });
  assert.equal(invalid.status,400);
  const arbitrary=await fetch(ctx.base+'/batch',{
   method:'POST',headers:{...ctx.headers,'Content-Type':'application/json'},
   body:JSON.stringify({listId,ids:['notinlist01']}),
  });
  assert.equal(arbitrary.status,400);
  const response=await fetch(ctx.base+'/batch',{
   method:'POST',headers:{...ctx.headers,'Content-Type':'application/json'},
   body:JSON.stringify({listId,ids:data.items.map(item=>item.id)}),
  });
  assert.equal(response.status,202);
  const {job}=await response.json();
  assert.equal(job.total,1000);
  await eventually(()=>downloaded.length===1000);
  const status=await fetch(ctx.base+'/batch/'+job.id,{headers:ctx.headers});
  assert.equal(status.status,200);
  const result=(await status.json()).job;
  assert.equal(result.total,1000);
  assert.equal(result.completed,1000);
  assert.equal(result.saved,1000);
  assert.equal(result.failed,0);
  assert.equal(result.status,'completed');
  assert.equal(downloaded[0],id(0));
  assert.equal(downloaded[999],id(999));
 }finally{await ctx.close();}
});
test('cancel stops the current song and prevents subsequent downloads',async()=>{
 let started=0;
 const runner={enabled:true,search:async()=>[],stream:()=>({}),
  listPlaylist:async()=>({entries:[{id:id(1)},{id:id(2)},{id:id(3)}]}),
  downloadOne:(_id,{signal})=>new Promise((_resolve,reject)=>{
   started++;
   signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true});
  }),
 };
 const ctx=await setup(runner);
 try{
  await fetch(ctx.base+'/playlist?list='+listId,{headers:ctx.headers});
  const response=await fetch(ctx.base+'/batch',{
   method:'POST',headers:{...ctx.headers,'Content-Type':'application/json'},
   body:JSON.stringify({listId,ids:[id(1),id(2),id(3)]}),
  });
  assert.equal(response.status,202);
  const {job}=await response.json();
  await eventually(()=>started===1);
  const stop=await fetch(ctx.base+'/batch/'+job.id+'/cancel',{method:'POST',headers:ctx.headers});
  assert.equal(stop.status,200);
  await new Promise(resolve=>setTimeout(resolve,30));
  const state=await fetch(ctx.base+'/batch/'+job.id,{headers:ctx.headers});
  assert.equal((await state.json()).job.status,'cancelled');
  assert.equal(started,1);
 }finally{await ctx.close();}
});
