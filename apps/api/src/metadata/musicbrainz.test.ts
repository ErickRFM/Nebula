import {describe,it,expect} from 'vitest';
import {MusicBrainzMetadata} from './musicbrainz';
describe('MusicBrainz metadata search',()=>{
  it('maps recordings with license-safe metadata, never audio',async()=>{
    const calls:{url:string;options?:RequestInit}[]=[];
    const provider=new MusicBrainzMetadata(async(url,options)=>{
      calls.push({url,options});
      return new Response(JSON.stringify({recordings:[{
        id:'6ba7b810-9dad-11d1-80b4-00c04fd430c8',title:'Example',length:188000,score:89,
        'artist-credit':[{name:'Banda'}],
        releases:[{id:'6ba7b811-9dad-11d1-80b4-00c04fd430c8',title:'Disco'}],
      }]}),{status:200});
    },0);
    const matches=await provider.search('ambient',5);
    expect(matches[0].artist).toBe('Banda');
    expect(matches[0].durationSeconds).toBe(188);
    expect(matches[0].coverArtCandidate).toContain('coverartarchive.org');
    expect('audioUrl' in matches[0]).toBe(false);
    expect(calls[0].url).toContain('musicbrainz.org/ws/2/recording');
    expect((calls[0].options?.headers as Record<string,string>)['User-Agent']).toContain('NebulaPrivateMusic');
  });
});
