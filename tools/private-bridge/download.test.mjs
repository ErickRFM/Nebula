import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {createBridgeServer} from './bridge-core.mjs';

const secret='nebula-test-bridge-download-secret-123456789';
const id='dQw4w9WgXcQ';
const mp3=Buffer.concat([Buffer.from('ID3'),Buffer.alloc(200,7)]);

async function setup(){
 const runner={
  enabled:true,search:async()=>[],
  stream(videoId){
   assert.equal(videoId,id);
   const output=new PassThrough();
   queueMicrotask(()=>output.end(mp3));
   return {output,cancel(){}};
  },
 };
 const bridge=createBridgeServer({secret,runner,port:0,origins:['https://nebula.example.test']});
 const address=await bridge.listen();
 return {bridge,base:'http://127.0.0.1:'+address.port};
}
test('private MP3 download uses signed ticket and remains loopback-only',async()=>{
 const {bridge,base}=await setup();
 try{
  const withoutTicket=await fetch(base+'/download');
  assert.equal(withoutTicket.status,400);
  const unauthorized=await fetch(base+'/ticket',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});
  assert.equal(unauthorized.status,401);
  const allowed=await fetch(base+'/ticket',{method:'POST',headers:{
   Authorization:'Bearer '+secret,'Content-Type':'application/json',Origin:'https://nebula.example.test',
  },body:JSON.stringify({id})});
  assert.equal(allowed.status,200);
  const {ticket}=await allowed.json();
  const rejectedOrigin=await fetch(base+'/download?ticket='+encodeURIComponent(ticket),{headers:{Origin:'https://evil.example.test'}});
  assert.equal(rejectedOrigin.status,403);
  const download=await fetch(base+'/download?ticket='+encodeURIComponent(ticket),{headers:{Origin:'https://nebula.example.test'}});
  assert.equal(download.status,200);
  assert.equal(download.headers.get('content-type'),'audio/mpeg');
  assert.equal(download.headers.get('x-nebula-download'),'1');
  assert.match(download.headers.get('content-disposition'),/attachment; filename="Nebula-[\w-]+\.mp3"/);
  assert.equal(download.headers.get('access-control-allow-origin'),'https://nebula.example.test');
  assert.deepEqual(Buffer.from(await download.arrayBuffer()),mp3);
  const invalid=await fetch(base+'/download?ticket='+encodeURIComponent(ticket)+'&extra=1');
  assert.equal(invalid.status,400);
 }finally{await bridge.close();}
});
