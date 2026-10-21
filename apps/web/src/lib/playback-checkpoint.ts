export type LocalPlaybackCheckpoint={trackId:string;time:number;queueIds:string[];savedAt:number};
const KEY='nebula:playback-local:v1';
export function normalizeCheckpoint(input:unknown,now=Date.now()):LocalPlaybackCheckpoint|null {
  if(!input||typeof input!=='object')return null;
  const x=input as Record<string,unknown>;
  if(typeof x.trackId!=='string'||!/^local-[a-zA-Z0-9-]{6,80}$/.test(x.trackId))return null;
  if(typeof x.time!=='number'||!Number.isFinite(x.time)||x.time<0||x.time>24*3600)return null;
  if(typeof x.savedAt!=='number'||!Number.isFinite(x.savedAt)||x.savedAt>now+60_000||now-x.savedAt>30*86400_000)return null;
  if(!Array.isArray(x.queueIds))return null;
  const ids=x.queueIds.filter((id):id is string=>typeof id==='string'&&/^local-[a-zA-Z0-9-]{6,80}$/.test(id));
  return {trackId:x.trackId,time:x.time,queueIds:[...new Set(ids)].slice(0,250),savedAt:x.savedAt};
}
export function readCheckpoint(storage:Pick<Storage,'getItem'>):LocalPlaybackCheckpoint|null{
  try{
    const raw=storage.getItem(KEY);
    return raw?normalizeCheckpoint(JSON.parse(raw) as unknown):null;
  }catch{return null;}
}
export function saveCheckpoint(storage:Pick<Storage,'setItem'>,value:LocalPlaybackCheckpoint):void{
  const safe=normalizeCheckpoint(value);
  if(!safe)return;
  try{storage.setItem(KEY,JSON.stringify(safe));}catch{/* storage is optional */}
}
