/**
 * MusicBrainz is metadata-only. It never supplies audio or storage rights.
 * Its public API requires an identifiable User-Agent and max one call/second.
 */
import type { JsonFetch } from '../discovery/client.js';

export interface RecordingMatch {
  recordingId:string;
  title:string;
  artist:string;
  releaseId:string|null;
  album:string|null;
  durationSeconds:number|null;
  score:number|null;
  sourceUrl:string;
  coverArtCandidate:string|null;
}

export class MusicBrainzMetadata {
  private nextAvailable=0;
  private queue:Promise<unknown>=Promise.resolve();
  constructor(private readonly fetchImpl:JsonFetch=fetch, private readonly intervalMs=1100) {}

  search(query:string,limit=10):Promise<RecordingMatch[]> {
    const run=async()=>{
      const wait=Math.max(0,this.nextAvailable-Date.now());
      if(wait>0) await new Promise<void>(resolve=>setTimeout(resolve,wait));
      this.nextAvailable=Date.now()+this.intervalMs;
      return this.performSearch(query,limit);
    };
    const pending=this.queue.then(run,run);
    this.queue=pending.then(()=>undefined,()=>undefined);
    return pending;
  }

  private async performSearch(query:string,limit:number):Promise<RecordingMatch[]> {
    const uri=new URL('https://musicbrainz.org/ws/2/recording');
    uri.searchParams.set('query',query);
    uri.searchParams.set('fmt','json');
    uri.searchParams.set('limit',String(Math.min(20,Math.max(1,limit))));
    const response=await this.fetchImpl(uri.toString(),{
      headers:{
        Accept:'application/json',
        'User-Agent':'NebulaPrivateMusic/0.1 (https://github.com/ErickRFM/Nebula)',
      },
      redirect:'error',
      signal:AbortSignal.timeout(8000),
    });
    if(!response.ok)throw Error('musicbrainz_http_'+response.status);
    if(Number(response.headers.get('content-length')??0)>2_000_000)throw Error('metadata_response_too_large');
    const json=await response.json() as Record<string,unknown>;
    const recordings=Array.isArray(json.recordings)?json.recordings:[];
    return recordings.flatMap((item):RecordingMatch[]=>{
      if(!item||typeof item!=='object')return [];
      const record=item as Record<string,unknown>;
      const uuid=typeof record.id==='string'?record.id:'';
      if(!/^[0-9a-fA-F-]{36}$/.test(uuid))return [];
      const credit=Array.isArray(record['artist-credit'])?record['artist-credit']:[];
      const authors=credit.flatMap((v):string[]=>{
        if(!v||typeof v!=='object')return [];
        const entry=v as Record<string,unknown>;
        const artist=entry.artist&&typeof entry.artist==='object' ? entry.artist as Record<string,unknown> : {};
        const name=typeof entry.name==='string'?entry.name:typeof artist.name==='string'?artist.name:'';
        return name?[name]:[];
      });
      const releases=Array.isArray(record.releases)?record.releases:[];
      const first=releases[0]&&typeof releases[0]==='object'?releases[0] as Record<string,unknown>:{};
      const releaseId=typeof first.id==='string'&&/^[0-9a-fA-F-]{36}$/.test(first.id)?first.id:null;
      const length=typeof record.length==='number'&&record.length>=0?Math.round(record.length/1000):null;
      return [{
        recordingId:uuid,title:String(record.title??'Sin título').slice(0,200),
        artist:authors.join(', ').slice(0,250)||'Artista no identificado',
        releaseId,album:typeof first.title==='string'?first.title.slice(0,200):null,
        durationSeconds:length,
        score:typeof record.score==='number'?record.score:null,
        sourceUrl:'https://musicbrainz.org/recording/'+uuid,
        // Candidate URL: existence has not been verified; use a placeholder on 404.
        coverArtCandidate:releaseId?'https://coverartarchive.org/release/'+releaseId+'/front-250':null,
      }];
    });
  }
}
