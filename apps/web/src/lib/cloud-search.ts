/** Pure match and rank for account-private R2 tracks, with accents ignored. */
export type IndexedCloudTrack={id:string;title:string;artist:string;byteSize:number;createdAt:string};
export const normalizeMusicQuery=(value:string):string=>value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').trim().replace(/\s+/g,' ');

export function searchCloudTracks<T extends Pick<IndexedCloudTrack,'title'|'artist'>>(tracks:T[],query:string):T[]{
  const term=normalizeMusicQuery(query);
  if(term.length<2)return [];
  const words=term.split(' ').filter(Boolean);
  return tracks.map((track,index)=>{
    const title=normalizeMusicQuery(track.title);
    const artist=normalizeMusicQuery(track.artist);
    const combined=title+' '+artist;
    if(!words.every(word=>combined.includes(word)))return null;
    const score=title===term?100:title.startsWith(term)?80:artist===term?65:artist.startsWith(term)?55:title.includes(term)?40:20;
    return {track,index,score};
  }).filter((row):row is {track:T;index:number;score:number}=>row!==null)
    .sort((a,b)=>b.score-a.score||a.index-b.index).map(row=>row.track);
}
