import { createJamendoProvider, createOpenverseProvider, createAudiusProvider } from './providers.js';
import type { AudioProvider, AudioProviderId, ExternalTrack, SearchRequest } from './types.js';
import { createInternetArchiveProvider } from './internet-archive.js';

export class DiscoveryService {
  constructor(readonly providers: AudioProvider[]=[
    createJamendoProvider(process.env.JAMENDO_CLIENT_ID),
    createOpenverseProvider(),
    createAudiusProvider(),
    createInternetArchiveProvider(),
  ]) {}
  list() {
    return this.providers.map(({id,enabled})=>({id,enabled}));
  }
  async search(request:SearchRequest,provider?:AudioProviderId) {
    const selected=this.providers.filter(p=>p.enabled && (!provider || provider===p.id));
    const settled=await Promise.allSettled(selected.map(p=>p.search(request)));
    const errors:string[]=[];
    const tracks:ExternalTrack[]=[];
    settled.forEach((result,index)=>{
      if(result.status==='fulfilled') tracks.push(...result.value.slice(0,request.limit));
      else errors.push(selected[index].id);
    });
    return {items:tracks,failedProviders:errors,disabledProviders:provider && !selected.length ? [provider] : []};
  }
}
