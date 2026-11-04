/**
 * A private stream is reachable ONLY from an explicit loopback origin.
 * The opt-in env flag is compiled at build time; production defaults to off.
 * Never allow arbitrary http URLs, host aliases, alternate ports or credentials.
 */
export const BRIDGE_URL='http://127.0.0.1:4177';
export const BRIDGE_ENABLED=process.env.NEXT_PUBLIC_ENABLE_PRIVATE_BRIDGE==='true';
const TICKET=/^[A-Za-z0-9_-]{20,300}\.[A-Za-z0-9_-]{30,80}$/;
export function isPlayableExternalUrl(value:unknown,bridgeEnabled=BRIDGE_ENABLED):value is string {
 if(typeof value!=='string'||value.length>2048)return false;
 try{
  const u=new URL(value);
  if(u.username||u.password)return false;
  if(u.protocol==='https:')return true;
  return bridgeEnabled && u.origin===BRIDGE_URL && u.pathname==='/stream' &&
    u.searchParams.size===1 && TICKET.test(u.searchParams.get('ticket')||'') &&
    !u.hash;
 }catch{return false;}
}
export type BridgeVideo={id:string;title:string;artist:string;durationSeconds:number|null;sourceUrl:string};
export function bridgeVideos(payload:unknown):BridgeVideo[]{
 const data=payload&&typeof payload==='object'? (payload as {items?:unknown}).items:null;
 if(!Array.isArray(data))return [];
 return data.slice(0,10).flatMap((raw):BridgeVideo[]=>{
  const item=raw&&typeof raw==='object'?raw as Record<string,unknown>:null;
  if(!item||typeof item.id!=='string'||!/^[A-Za-z0-9_-]{11}$/.test(item.id))return [];
  const sec=item.durationSeconds;
  return [{
    id:item.id,title:typeof item.title==='string'?item.title.slice(0,180):'Sin título',
    artist:typeof item.artist==='string'?item.artist.slice(0,100):'YouTube',
    durationSeconds:typeof sec==='number'&&Number.isFinite(sec)&&sec>=0?sec:null,
    sourceUrl:'https://www.youtube.com/watch?v='+item.id,
  }];
 });
}
