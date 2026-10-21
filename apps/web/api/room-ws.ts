import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { Pool } from 'pg';
import { WebSocketServer } from 'ws';

// Vercel Functions support exporting a Node HTTP server for WebSocket upgrade.
// Connections are deliberately bounded. PostgreSQL stays authoritative.
const server = createServer((_req,res)=>{
 res.writeHead(426,{'Content-Type':'application/json','Cache-Control':'no-store'});
 res.end(JSON.stringify({error:'websocket_upgrade_required'}));
});
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:2,connectionTimeoutMillis:5000});
const wss=new WebSocketServer({server,maxPayload:1024,perMessageDeflate:false,
 handleProtocols: protocols => protocols.has('nebula.room.v1')?'nebula.room.v1':false});
type Member={roomId:string;userId:string;sessionId:string};
type Snapshot={revision:number;participantCount:number};
wss.on('connection',(socket,request)=>{
 const raw=request.headers['sec-websocket-protocol'];
 const protocols=typeof raw==='string'?raw.split(',').map(x=>x.trim()):[];
 const ticket=protocols.length===2&&protocols[0]==='nebula.room.v1'&&/^[A-Za-z0-9_-]{43}$/.test(protocols[1])
  ?protocols[1]:null;
 let ended=false,querying=false,member:Member|null=null,last='';
 const end=()=>{
  if(ended)return;ended=true;
  clearInterval(interval);clearTimeout(deadline);
  if(socket.readyState===1)socket.close(1000,'Reconnect');
 };
 const poll=async()=>{
  if(!member||ended||querying)return;querying=true;
  try {
   const result=await pool.query<Snapshot>(`
    SELECT r.revision::int AS revision,
      (SELECT count(*)::int FROM room_members mm WHERE mm.room_id=r.id) AS "participantCount"
    FROM rooms r JOIN room_members m ON m.room_id=r.id AND m.user_id=$2
    JOIN sessions s ON s.id=$3 AND s.user_id=$2 AND s.revoked_at IS NULL AND s.expires_at>now()
    WHERE r.id=$1 AND r.status='active'
   `,[member.roomId,member.userId,member.sessionId]);
   const state=result.rows[0];
   if(!state){socket.close(1008,'Membership ended');end();return;}
   const fingerprint=state.revision+':'+state.participantCount;
   if(last!==fingerprint&&socket.readyState===1){
    last=fingerprint;
    if(socket.bufferedAmount<16_384)socket.send(JSON.stringify({type:'room',...state}));
   }
  }catch{socket.close(1011,'Room unavailable');end();}
  finally{querying=false;}
 };
 const interval=setInterval(()=>{void poll();},1000);
 const deadline=setTimeout(end,22_000);
 socket.on('close',end);socket.on('error',end);
 // No remote playback commands through the socket, ever.
 socket.on('message',()=>{socket.close(1008,'Read-only channel');end();});
 void(async()=>{
  try {
   if(!ticket){socket.close(1008,'Invalid handshake');end();return;}
   const hashed=createHash('sha256').update(ticket).digest('hex');
   const result=await pool.query<Member>(`
    DELETE FROM room_ws_tickets t WHERE t.token_hash=$1 AND t.expires_at>now()
    AND EXISTS (SELECT 1 FROM rooms r JOIN room_members m ON m.room_id=r.id AND m.user_id=t.user_id
      JOIN sessions s ON s.id=t.session_id AND s.user_id=t.user_id
      WHERE r.id=t.room_id AND r.status='active' AND s.revoked_at IS NULL AND s.expires_at>now())
    RETURNING t.room_id AS "roomId",t.user_id AS "userId",t.session_id AS "sessionId"
   `,[hashed]);
   member=result.rows[0]??null;
   if(!member){socket.close(1008,'Invalid ticket');end();return;}
   await poll();
  }catch{socket.close(1011,'Room unavailable');end();}
 })();
});
export default server;
