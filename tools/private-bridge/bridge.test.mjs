import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {Readable} from 'node:stream';
import {createBridgeServer,createTicket,verifyTicket,normalizeVideos,normalizeOrigins} from './bridge-core.mjs';

const SECRET='x'.repeat(64);
test('normalizes IDs and sorts playable song-length videos',()=>{
 const results=normalizeVideos({entries:[
  {id:'abcdefghijk',title:'long',duration:7800},
  {id:'12345678901',title:'short',duration:180,channel:'Artist'},
  {id:'..unsafe...',title:'bad'},
  {id:'12345678901',title:'duplicate'},
 ]});
 assert.deepEqual(results.map(x=>x.id),['12345678901','abcdefghijk']);
});
test('tickets are authenticated, non-predictable and expire',()=>{
 const a=createTicket('abcdefghijk',SECRET,1000);
 const b=createTicket('abcdefghijk',SECRET,1000);
 assert.notEqual(a,b);
 assert.equal(verifyTicket(a,SECRET,1001),'abcdefghijk');
 assert.equal(verifyTicket(a,SECRET,121001),null);
 const [payload,signature]=a.split('.');
 const changed=(signature[0]==='A'?'B':'A')+signature.slice(1);
 assert.equal(verifyTicket(payload+'.'+changed,SECRET,1001),null);
 assert.equal(verifyTicket(a,'z'.repeat(64),1001),null);
});
test('only exact origins are allowed',()=>{
 assert.throws(()=>normalizeOrigins('https://*.example.com'));
 assert.deepEqual(normalizeOrigins('http://localhost:3000,http://127.0.0.1:3000').length,2);
});
test('localhost bridge denies foreign origins, wrong tokens and bad tickets',async()=>{
 let cancelled=0;const streamIds=[];
 const fake={
  enabled:true,
  async search(){return [{id:'abcdefghijk',title:'Example',artist:'Artist',durationSeconds:120}]},
  stream(id){streamIds.push(id);return{output:Readable.from([Buffer.from('FAKE-MP3')]),cancel:()=>{cancelled++}};}
 };
 const app=createBridgeServer({secret:SECRET,port:0,origins:['http://localhost:3000'],runner:fake});
 const address=await app.listen();
 const base='http://127.0.0.1:'+address.port;
 try{
  let res=await fetch(base+'/search?q=test',{headers:{Origin:'https://evil.test',Authorization:'Bearer '+SECRET}});
  assert.equal(res.status,403);
  res=await fetch(base+'/search?q=test',{headers:{Origin:'http://localhost:3000'}});
  assert.equal(res.status,401);
  res=await fetch(base+'/search?q=test',{headers:{Origin:'http://localhost:3000',Authorization:'Bearer '+SECRET}});
  assert.equal(res.status,200);
  assert.equal((await res.json()).items[0].id,'abcdefghijk');
  res=await fetch(base+'/ticket',{method:'POST',headers:{Origin:'http://localhost:3000',Authorization:'Bearer '+SECRET,'Content-Type':'application/json'},body:JSON.stringify({id:'invalid'})});
  assert.equal(res.status,400);
  res=await fetch(base+'/ticket',{method:'POST',headers:{Origin:'http://localhost:3000',Authorization:'Bearer '+SECRET,'Content-Type':'application/json'},body:JSON.stringify({id:'abcdefghijk'})});
  assert.equal(res.status,200);
  const {ticket}=await res.json();
  res=await fetch(base+'/stream?ticket='+encodeURIComponent(ticket),{headers:{Origin:'http://localhost:3000'}});
  assert.equal(res.status,200);
  assert.equal(res.headers.get('Content-Type'),'audio/mpeg');
  assert.equal(await res.text(),'FAKE-MP3');
  assert.deepEqual(streamIds,['abcdefghijk']);
 }finally{await app.close();}
});
