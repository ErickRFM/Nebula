import {describe,expect,it} from 'vitest';
import {createInternetArchiveProvider} from './internet-archive';
import {DiscoveryService} from './service';
import type {JsonFetch} from './client';

const request={query:'noche',page:1,limit:10};
const item=(licenseurl?:string,extra:Record<string,unknown>={})=>({
  metadata:{title:'Canciones nocturnas',creator:'Banda de archivo',mediatype:'audio',
    ...(licenseurl?{licenseurl}:{}),...extra},
  files:[
    {name:'cover.jpg',source:'original',format:'JPEG',size:'5000'},
    {name:'album/track 01.mp3',source:'original',format:'VBR MP3',size:'40000',length:'03:42',title:'Noche uno'},
    {name:'album/private.mp3',source:'original',format:'VBR MP3',size:'40000',private:true},
  ]
});
function mockProvider(items:Record<string,unknown>,metadata:Record<string,unknown>) {
  const calls:string[]=[];
  const fetcher:JsonFetch=async url=>{
    const parsed=new URL(url);
    calls.push(url);
    if(parsed.pathname==='/advancedsearch.php')return new Response(JSON.stringify({response:{docs:Object.values(items)}}),{status:200});
    const identifier=parsed.pathname.split('/').at(-1)!;
    const info=metadata[identifier];
    if(info===undefined)return new Response('not found',{status:404});
    return new Response(JSON.stringify(info),{status:200});
  };
  return {provider:createInternetArchiveProvider(fetcher),calls};
}
describe('Internet Archive keyless audio adapter',()=>{
  it('uses the official item search API with literal escaped title and creator',async()=>{
    const {provider,calls}=mockProvider({good:{identifier:'live_set_2026',title:'Noche'}},{
      live_set_2026:item('http://creativecommons.org/licenses/by/4.0/')
    });
    const [track]=await provider.search({...request,query:'noche OR mediatype:movies'});
    expect(track.provider).toBe('internetarchive');
    expect(track.externalId).toMatch(/^[a-f0-9]{40}$/);
    expect(track.title).toBe('Noche uno');
    expect(track.artist).toBe('Banda de archivo');
    expect(track.durationSeconds).toBe(222);
    expect(track.sourceUrl).toBe('https://archive.org/details/live_set_2026');
    expect(track.streamUrl).toBe('https://archive.org/download/live_set_2026/album/track%2001.mp3');
    expect(track.licenseUrl).toBe('https://creativecommons.org/licenses/by/4.0/');
    expect(track.canStream).toBe(true);
    expect(track.canDownload).toBe(false);
    expect(track.canStorePrivateCopy).toBe(false);
    const query=new URL(calls[0]);
    expect(query.hostname).toBe('archive.org');
    expect(query.searchParams.get('q')).not.toContain('mediatype:movies');
    expect(query.searchParams.get('rows')).toBe('6');
    expect(calls[1]).toBe('https://archive.org/metadata/live_set_2026');
  });
  it('does not present items without explicit CC/public-domain license or public audio file',async()=>{
    const {provider}=mockProvider({
      unknown:{identifier:'missing_license'},
      private:{identifier:'private_record'},
      invalid:{identifier:'malicious_id'},
      safe:{identifier:'open_record'},
    },{
      missing_license:item(),
      private_record:item('https://creativecommons.org/licenses/by/4.0/',{'access-restricted-item':'true'}),
      malicious_id:item('https://creativecommons.org/licenses/by/4.0/'),
      open_record:{metadata:{title:'Archivo',mediatype:'audio',
        licenseurl:'https://creativecommons.org/licenses/by-sa/4.0/'},files:[{name:'document.pdf',size:'900',source:'original'}]},
    });
    expect(await provider.search(request)).toEqual([]);
  });
  it('handles failure of one metadata endpoint without losing other tracks',async()=>{
    const {provider}=mockProvider({
      broken:{identifier:'missing_meta'},
      good:{identifier:'release_2026'},
    },{
      release_2026:item('https://creativecommons.org/publicdomain/zero/1.0/'),
    });
    const tracks=await provider.search(request);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].sourceUrl).toBe('https://archive.org/details/release_2026');
  });
  it('works alongside existing providers when metadata is unavailable',async()=>{
    const {provider}=mockProvider({only:{identifier:'missing_meta'}},{});
    const result=await new DiscoveryService([provider]).search(request);
    expect(result).toEqual({items:[],failedProviders:[],disabledProviders:[]});
  });
});
