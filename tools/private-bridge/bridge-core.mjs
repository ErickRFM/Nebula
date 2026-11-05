import {createServer} from 'node:http';
import {createHmac, randomBytes, timingSafeEqual} from 'node:crypto';
import {createPlaylistBatchManager,PLAYLIST_ID} from './playlist-batch.mjs';

export const VIDEO_ID=/^[A-Za-z0-9_-]{11}$/;
const DEFAULT_ORIGINS=['http://localhost:3000','http://127.0.0.1:3000'];
const LIMIT=3_000;

export function normalizeOrigins(value){
 if(!value)return DEFAULT_ORIGINS;
 const origins=value.split(',').map(x=>x.trim()).filter(Boolean);
 if(!origins.length || origins.some(x=>{
  try {const u=new URL(x);return !['http:','https:'].includes(u.protocol)||u.origin!==x||x.includes('*');}
  catch{return true;}
 }))throw Error('NEBULA_BRIDGE_ORIGINS must contain exact HTTP(S) origins without wildcards');
 return origins;
}
export function normalizeVideos(payload){
 const entries=Array.isArray(payload?.entries)?payload.entries:[];
 const seen=new Set();
 return entries.slice(0,30).flatMap(item=>{
  if(!item||typeof item!=='object'||!VIDEO_ID.test(item.id)||seen.has(item.id)||item.is_live===true||item.live_status==='is_live')return [];
  seen.add(item.id);
  const duration=Number(item.duration);
  return [{id:item.id,title:String(item.title||'Sin título').slice(0,180),
   artist:String(item.channel||item.uploader||'YouTube').slice(0,100),
   durationSeconds:Number.isFinite(duration)&&duration>=0&&duration<=86400?Math.round(duration):null,
   sourceUrl:'https://www.youtube.com/watch?v='+item.id,
  }];
 }).sort((a,b)=>Number((a.durationSeconds??0)>1200)-Number((b.durationSeconds??0)>1200)).slice(0,10);
}
function mac(message,secret){return createHmac('sha256',secret).update(message).digest('base64url');}
export function createTicket(id,secret,now=Date.now()){
 if(!VIDEO_ID.test(id))throw Error('invalid_video_id');
 const payload=Buffer.from(JSON.stringify({id,exp:now+120_000,n:randomBytes(12).toString('base64url')})).toString('base64url');
 return payload+'.'+mac(payload,secret);
}
export function verifyTicket(ticket,secret,now=Date.now()){
 if(typeof ticket!=='string'||ticket.length>380)return null;
 const parts=ticket.split('.');
 if(parts.length!==2||!parts.every(s=>/^[A-Za-z0-9_-]+$/.test(s)))return null;
 const provided=Buffer.from(parts[1]);const expected=Buffer.from(mac(parts[0],secret));
 if(provided.length!==expected.length||!timingSafeEqual(provided,expected))return null;
 try {
  const o=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));
  if(!VIDEO_ID.test(o.id)||typeof o.exp!=='number'||o.exp<now||o.exp>now+120_000||typeof o.n!=='string')return null;
  return o.id;
 }catch{return null;}
}
function reply(res,status,data){
 const body=JSON.stringify(data);
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(body)});
 res.end(body);
}
function validToken(value,secret){
 if(typeof value!=='string'||!value.startsWith('Bearer '))return false;
 const given=Buffer.from(value.slice(7));
 const expected=Buffer.from(secret);
 return given.length===expected.length&&timingSafeEqual(given,expected);
}
async function readJson(req,limit=LIMIT){
 let size=0;const chunks=[];
 for await (const chunk of req){
  size+=chunk.length;if(size>limit)throw Error('payload_too_large');
  chunks.push(chunk);
 }
 try {return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
 catch {throw Error('invalid_json');}
}
export function createBridgeServer({secret,runner,port=4177,host='127.0.0.1',origins=DEFAULT_ORIGINS,clock=Date.now,logger=()=>{},downloadDir=process.env.NEBULA_DOWNLOAD_DIR}){
 if(typeof secret!=='string'||secret.length<32)throw Error('Bridge token must have at least 32 characters');
 if(!runner||typeof runner.search!=='function'||typeof runner.stream!=='function')throw Error('runner required');
 let active=0;const searchHits=[];const playlistHits=[];
 const batches=createPlaylistBatchManager({runner,downloadDir,clock});
 const server=createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Frame-Options','DENY');
  const address=server.address();
  const actualPort=typeof address==='object'&&address?address.port:port;
  const expectedHosts=['localhost:'+actualPort,'127.0.0.1:'+actualPort];
  if(!expectedHosts.includes(req.headers.host)){reply(res,403,{error:'invalid_host'});return;}
  const origin=req.headers.origin;
  if(origin && !origins.includes(origin)){reply(res,403,{error:'origin_forbidden'});return;}
  if(origin){
   res.setHeader('Access-Control-Allow-Origin',origin);
   res.setHeader('Vary','Origin');
  }
  if(req.method==='OPTIONS'){
   res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
   res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
   res.setHeader('Access-Control-Max-Age','600');
   if(req.headers['access-control-request-private-network']==='true')res.setHeader('Access-Control-Allow-Private-Network','true');
   res.writeHead(204);res.end();return;
  }
  const url=new URL(req.url||'/', 'http://127.0.0.1:'+actualPort);
  if(req.method==='GET'&&url.pathname==='/health'){
   reply(res,200,{status:'ok',private:true,enabled:runner.enabled!==false});return;
  }
  if(req.method==='GET'&&url.pathname==='/search'){
   if(!validToken(req.headers.authorization,secret)){reply(res,401,{error:'unauthorized'});return;}
   if(runner.enabled===false){reply(res,503,{error:'bridge_disabled'});return;}
   const query=(url.searchParams.get('q')||'').trim();
   if(query.length<2||query.length>100){reply(res,400,{error:'invalid_query'});return;}
   const now=clock();
   while(searchHits.length&&searchHits[0]<now-60_000)searchHits.shift();
   if(searchHits.length>=10){reply(res,429,{error:'search_rate_limited'});return;}
   searchHits.push(now);
   try{
    const found=await runner.search(query);
    reply(res,200,{items:Array.isArray(found)?found.slice(0,10):[]});
   }catch(e){logger('search_failed',e?.message);reply(res,502,{error:'search_unavailable'});}
   return;
  }
  if(req.method==='GET'&&url.pathname==='/playlist'){
   if(!validToken(req.headers.authorization,secret)){reply(res,401,{error:'unauthorized'});return;}
   if(runner.enabled===false){reply(res,503,{error:'bridge_disabled'});return;}
   const listId=url.searchParams.get('list');
   if(url.searchParams.size!==1||!PLAYLIST_ID.test(listId||'')){reply(res,400,{error:'invalid_playlist_id'});return;}
   const now=clock();
   while(playlistHits.length&&playlistHits[0]<now-60_000)playlistHits.shift();
   if(playlistHits.length>=6){reply(res,429,{error:'playlist_rate_limited'});return;}
   playlistHits.push(now);
   try{reply(res,200,await batches.load(listId));}
   catch(e){logger('playlist_failed',e?.message);reply(res,502,{error:'playlist_unavailable'});}
   return;
  }
  if(req.method==='POST'&&url.pathname==='/batch'){
   if(!validToken(req.headers.authorization,secret)){reply(res,401,{error:'unauthorized'});return;}
   if(runner.enabled===false){reply(res,503,{error:'bridge_disabled'});return;}
   let body;
   try{body=await readJson(req,24_000);}catch{reply(res,400,{error:'invalid_batch_payload'});return;}
   try{
    const job=batches.start(body?.listId,body?.ids);
    reply(res,202,{job});
   }catch(e){
    const code=e?.message==='batch_busy'?409:e?.message==='preview_expired'?410:400;
    reply(res,code,{error:code===409?'batch_busy':code===410?'playlist_preview_expired':'invalid_batch_selection'});
   }
   return;
  }
  const match=new RegExp('^/batch/([0-9a-f-]{36})(/cancel)?$').exec(url.pathname);
  if(match&&(req.method==='GET'&&!match[2]||req.method==='POST'&&match[2])){
   if(!validToken(req.headers.authorization,secret)){reply(res,401,{error:'unauthorized'});return;}
   if(url.searchParams.size){reply(res,400,{error:'invalid_batch_params'});return;}
   const job=match[2]?batches.cancel(match[1]):batches.status(match[1]);
   if(!job){reply(res,404,{error:'batch_not_found'});return;}
   reply(res,200,{job});return;
  }
  if(req.method==='POST'&&url.pathname==='/ticket'){
   if(!validToken(req.headers.authorization,secret)){reply(res,401,{error:'unauthorized'});return;}
   if(runner.enabled===false){reply(res,503,{error:'bridge_disabled'});return;}
   try{
    const body=await readJson(req);
    if(!VIDEO_ID.test(body?.id)){reply(res,400,{error:'invalid_video_id'});return;}
    reply(res,200,{ticket:createTicket(body.id,secret,clock()),expiresInSeconds:120});
   }catch(e){reply(res,400,{error:e.message==='payload_too_large'?'payload_too_large':'invalid_json'});}
   return;
  }
  if(req.method==='GET'&&(url.pathname==='/stream'||url.pathname==='/download')){
   // Download uses the same short-lived signed ticket as streaming; never accept raw URLs.
   const downloading=url.pathname==='/download';
   if(url.searchParams.size!==1||!url.searchParams.has('ticket')){reply(res,400,{error:'invalid_stream_params'});return;}
   const id=verifyTicket(url.searchParams.get('ticket'),secret,clock());
   if(!id){reply(res,401,{error:'expired_or_invalid_ticket'});return;}
   if(runner.enabled===false){reply(res,503,{error:'bridge_disabled'});return;}
   if(active>=1){reply(res,429,{error:'only_one_stream_at_a_time'});return;}
   active++;
   let stream;
   try{stream=runner.stream(id);}
   catch(e){active--;logger('stream_start_failed',e?.message);reply(res,503,{error:'player_unavailable'});return;}
   if(!stream?.output?.pipe||typeof stream.cancel!=='function'){
    active--;reply(res,503,{error:'player_unavailable'});return;
   }
   let settled=false;
   function release(){
    if(settled)return;
    settled=true;active=Math.max(0,active-1);
    stream.cancel();
   }
   stream.output.once('error',e=>{
    logger('stream_error',e?.message);
    if(!res.headersSent)reply(res,502,{error:'provider_stream_failed'});
    else res.destroy();
    release();
   });
   res.on('close',release);
   res.setHeader('Content-Type','audio/mpeg');
   res.setHeader('Accept-Ranges','none');
   if(downloading){
    res.setHeader('Content-Disposition','attachment; filename="Nebula-'+id+'.mp3"');
    res.setHeader('X-Nebula-Download','1');
   }
   stream.output.pipe(res);
   return;
  }
  reply(res,404,{error:'not_found'});
 });
 return {server,listen:()=>new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(port,host,()=>{server.off('error',reject);resolve(server.address());});
 }),close:()=>{batches.shutdown();return new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}};
}
