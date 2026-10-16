import { describe, expect, it } from 'vitest';
import { createAudiusProvider, createJamendoProvider, createOpenverseProvider } from './providers';
import { DiscoveryService } from './service';
import type { AudioProvider } from './types';
import { safeHttpsUrl } from './types';

const fake=(value:unknown) => async (_url:string) => new Response(JSON.stringify(value),{
  status:200,headers:{'content-type':'application/json'},
});
const request={query:'noche',page:1,limit:10};
describe('music provider adapters',()=>{
  it('disables Jamendo without client id',async()=>{
    const provider=createJamendoProvider(undefined,fake({results:[]}));
    expect(provider.enabled).toBe(false);
    expect(await provider.search(request)).toEqual([]);
  });
  it('normalizes Jamendo and never grants R2 copy permission',async()=>{
    const provider=createJamendoProvider('test_client_123',fake({
      headers:{status:'success'},results:[{
        id:'123',name:'Luz',artist_name:'A',album_name:'Cielo',
        duration:123,image:'https://usercontent.jamendo.com/a',
        audio:'https://prod-1.storage.jamendo.com/audio.mp3',
        audiodownload:'https://prod-1.storage.jamendo.com/download.mp3',
        audiodownload_allowed:true,license_ccurl:'http://creativecommons.org/licenses/by/4.0/',
        shareurl:'https://www.jamendo.com/track/123',
      }]
    }));
    const [song]=await provider.search(request);
    expect(song.id).toBe('jamendo:123');
    expect(song.canStream).toBe(true);
    expect(song.canDownload).toBe(true);
    expect(song.canStorePrivateCopy).toBe(false);
    expect(song.licenseUrl).toBe('https://creativecommons.org/licenses/by/4.0/');
  });
  it('normalizes Openverse and leaves download unverified',async()=>{
    const provider=createOpenverseProvider(fake({results:[{
      id:'record-1',title:'Cielo',creator:'Author',url:'https://audio.example.org/test.ogg',
      foreign_landing_url:'https://archive.example.org/a',license_url:'https://creativecommons.org/publicdomain/zero/1.0/'
    }]}));
    const [song]=await provider.search(request);
    expect(song.provider).toBe('openverse');
    expect(song.canStream).toBe(true);
    expect(song.canDownload).toBe(false);
    expect(song.canStorePrivateCopy).toBe(false);
  });
  it('Audius search does not pretend to have resolved a stream URL',async()=>{
    const provider=createAudiusProvider(fake({data:[{
      id:'ABC123',title:'Sound',duration:202,
      permalink:'https://audius.co/a/sound',user:{name:'Artist'},
      artwork:{'480x480':'https://audius.co/art.jpg'}
    }]}));
    const [song]=await provider.search(request);
    expect(song.id).toBe('audius:ABC123');
    expect(song.canStream).toBe(false);
    expect(song.streamUrl).toBeNull();
  });
  it('exposes official Audius stream only for explicitly ungated public tracks',async()=>{
    const provider=createAudiusProvider(async(url)=> {
      expect(url).toContain('gate_condition=ungated');
      return new Response(JSON.stringify({data:[
        {id:'A1',title:'Public',permalink:'https://audius.co/a/1',is_stream_gated:false,is_scheduled_release:false},
        {id:'A2',title:'Gated',permalink:'https://audius.co/a/2',is_stream_gated:true},
      ]}),{status:200});
    });
    const [publicTrack,blockedTrack]=await provider.search(request);
    expect(publicTrack.canStream).toBe(true);
    expect(publicTrack.streamUrl).toBe('https://api.audius.co/v1/tracks/A1/stream');
    expect(publicTrack.canStorePrivateCopy).toBe(false);
    expect(blockedTrack.canStream).toBe(false);
    expect(blockedTrack.streamUrl).toBeNull();
  });

  it('filters invalid URLs, handles partial provider failures',async()=>{
    expect(safeHttpsUrl('http://127.0.0.1/private')).toBeNull();
    expect(safeHttpsUrl('https://name:pass@example.org')).toBeNull();
    const provider:AudioProvider={id:'openverse',enabled:true,search:async()=>{throw Error('down')}};
    const ok:AudioProvider={id:'audius',enabled:true,search:async()=>[]};
    const service=new DiscoveryService([provider,ok]);
    expect(await service.search(request)).toEqual({items:[],failedProviders:['openverse'],disabledProviders:[]});
  });
});
