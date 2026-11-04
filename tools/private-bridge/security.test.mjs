import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {request} from 'node:http';
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
  // Node fetch/undici may rewrite Host; use raw node:http to exercise DNS-rebinding defense.
  const status=await new Promise((resolve,reject)=>{
   const req=request({hostname:'127.0.0.1',port,path:'/health',headers:{Host:'evil.test'}},res=>{
    res.resume();res.on('end',()=>resolve(res.statusCode));
   });
   req.on('error',reject);req.end();
  });
  assert.equal(status,403);
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
