import test from 'node:test';
import assert from 'node:assert/strict';
import {createBridgeServer} from './bridge-core.mjs';
import {sanitizeYouTubeUrl} from './url-policy.mjs';

const secret='nebula-test-bridge-resolve-secret-1234567890';

async function setup(runner){
 const bridge=createBridgeServer({secret,runner,port:0,origins:['http://localhost:3000']});
 const address=await bridge.listen();
 return {bridge,base:'http://127.0.0.1:'+address.port};
}

function fakeResolveRunner(calls){
 return {
  enabled:true,
  async search(){return [];},
  async resolve(url){
   if(!sanitizeYouTubeUrl(url))throw Error('invalid_url');
   calls.push(url);
   return {items:[{id:'abcdefghijk',title:'Song',artist:'Chan',durationSeconds:180,sourceUrl:'https://www.youtube.com/watch?v=abcdefghijk'}],truncated:false};
  },
  stream(){throw Error('unused');},
 };
}

test('/resolve expands a playlist URL for a paired token only',async()=>{
 const calls=[];
 const {bridge,base}=await setup(fakeResolveRunner(calls));
 try{
  const anon=await fetch(base+'/resolve?url=https%3A%2F%2Fwww.youtube.com%2Fplaylist%3Flist%3DRDabc');
  assert.equal(anon.status,401);
  const ok=await fetch(base+'/resolve?url='+encodeURIComponent('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ'),{headers:{Authorization:'Bearer '+secret}});
  assert.equal(ok.status,200);
  const body=await ok.json();
  assert.equal(body.items[0].id,'abcdefghijk');
  assert.equal(body.truncated,false);
  assert.equal(calls[0],'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ');
  const bad=await fetch(base+'/resolve?url=not-a-url',{headers:{Authorization:'Bearer '+secret}});
  assert.equal(bad.status,400);
  const evil=await fetch(base+'/resolve?url=https%3A%2F%2Fevil.test%2Fwatch%3Fv%3Dabcdefghijk',{headers:{Authorization:'Bearer '+secret}});
  assert.equal(evil.status,400);
  const extra=await fetch(base+'/resolve?url=x&extra=1',{headers:{Authorization:'Bearer '+secret}});
  assert.equal(extra.status,400);
 }finally{await bridge.close();}
});

test('/resolve rejects foreign origins before touching the runner',async()=>{
 const calls=[];
 const {bridge,base}=await setup(fakeResolveRunner(calls));
 try{
  const res=await fetch(base+'/resolve?url=https%3A%2F%2Fwww.youtube.com%2Fplaylist%3Flist%3DRDabc',{headers:{Authorization:'Bearer '+secret,Origin:'https://evil.example.test'}});
  assert.equal(res.status,403);
  assert.equal(calls.length,0);
 }finally{await bridge.close();}
});
