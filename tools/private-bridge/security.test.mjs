import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {createBridgeServer} from './bridge-core.mjs';
import {Readable} from 'node:stream';

test('private bridge blocks DNS rebinding via invalid Host header',async()=>{
 const secret='A'.repeat(64);
 const app=createBridgeServer({secret,port:0,runner:{
  enabled:true,search:async()=>[],stream:()=>({output:Readable.from([]),cancel:()=>{}}),
 }});
 const info=await app.listen();
 try{
  const port=info.port;
  const response=await fetch('http://127.0.0.1:'+port+'/health',{headers:{Host:'evil.test'}});
  assert.equal(response.status,403);
 }finally{await app.close();}
});
test('bridge refuses disabled provider rather than pretending a stream exists',async()=>{
 const secret='B'.repeat(64);
 const app=createBridgeServer({secret,port:0,runner:{
  enabled:false,search:async()=>[],stream:()=>{throw Error('disabled');},
 }});
 const info=await app.listen();const url='http://127.0.0.1:'+info.port;
 try{
  const health=await (await fetch(url+'/health')).json();
  assert.equal(health.enabled,false);
  const response=await fetch(url+'/search?q=music',{headers:{Authorization:'Bearer '+secret}});
  assert.equal(response.status,503);
 }finally{await app.close();}
});
