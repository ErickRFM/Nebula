import type { AudioProvider, AudioProviderId, ExternalTrack, SearchRequest } from './types.js';
import { durationField, normalizeLicenseUrl, safeHttpsUrl, stringField } from './types.js';
import { loadProviderJson, type JsonFetch } from './client.js';

function array(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item):item is Record<string,unknown> =>
    item !== null && typeof item === 'object' && !Array.isArray(item)) : [];
}

function track(id: AudioProviderId, externalId: string, value: Partial<ExternalTrack>): ExternalTrack {
  return {
    provider:id, externalId, id:id+':'+externalId,
    title:value.title ?? 'Sin título', artist:value.artist ?? 'Artista desconocido',
    album:value.album ?? null, durationSeconds:value.durationSeconds ?? null,
    artworkUrl:value.artworkUrl ?? null, sourceUrl:value.sourceUrl ?? '',
    licenseUrl:value.licenseUrl ?? null, canStream:value.canStream ?? false,
    canDownload:value.canDownload ?? false, canStorePrivateCopy:false,
    streamUrl:value.streamUrl ?? null,
  };
}

export function createJamendoProvider(clientId?:string, fetchImpl:JsonFetch=fetch): AudioProvider {
  const enabled=Boolean(clientId && /^[a-zA-Z0-9_-]{5,100}$/.test(clientId));
  return {
    id:'jamendo', enabled,
    async search({query,page,limit}:SearchRequest) {
      if(!enabled) return [];
      const url=new URL('https://api.jamendo.com/v3.0/tracks/');
      url.searchParams.set('client_id',clientId!);
      url.searchParams.set('format','json');
      url.searchParams.set('include','licenses');
      url.searchParams.set('type','single albumtrack');
      url.searchParams.set('search',query);
      url.searchParams.set('limit',String(limit));
      url.searchParams.set('offset',String((page-1)*limit));
      const json=await loadProviderJson(url,fetchImpl) as {headers?:{status?:string};results?:unknown};
      if(json?.headers?.status !== 'success') throw new Error('jamendo_api_error');
      return array(json.results).flatMap((row):ExternalTrack[]=>{
        const externalId=String(row.id??'');
        if(!/^\d+$/.test(externalId)) return [];
        const streamUrl=safeHttpsUrl(row.audio);
        return [track('jamendo',externalId,{
          title:stringField(row.name,'Sin título'),
          artist:stringField(row.artist_name,'Artista desconocido'),
          album:stringField(row.album_name)||null,
          durationSeconds:durationField(row.duration),
          artworkUrl:safeHttpsUrl(row.image),
          sourceUrl:safeHttpsUrl(row.shareurl) ?? 'https://www.jamendo.com/track/'+externalId,
          licenseUrl:normalizeLicenseUrl(row.license_ccurl),
          canStream:Boolean(streamUrl),
          canDownload:row.audiodownload_allowed===true && Boolean(safeHttpsUrl(row.audiodownload)),
          streamUrl,
        })];
      });
    },
  };
}

export function createOpenverseProvider(fetchImpl:JsonFetch=fetch):AudioProvider {
  return {
    id:'openverse',enabled:true,
    async search({query,page,limit}:SearchRequest){
      const url=new URL('https://api.openverse.org/v1/audio/');
      url.searchParams.set('q',query);url.searchParams.set('page',String(page));url.searchParams.set('page_size',String(limit));
      const json=await loadProviderJson(url,fetchImpl) as {results?:unknown};
      return array(json?.results).flatMap((row):ExternalTrack[]=>{
        const externalId=stringField(row.id);
        if(!externalId || externalId.length>200) return [];
        const streamUrl=safeHttpsUrl(row.url);
        const sourceUrl=safeHttpsUrl(row.foreign_landing_url) ?? safeHttpsUrl(row.detail_url);
        if(!sourceUrl) return [];
        return [track('openverse',externalId,{
          title:stringField(row.title,'Sin título'),
          artist:stringField(row.creator,'Autor no identificado'),
          album:null,
          durationSeconds:durationField(row.duration),
          artworkUrl:safeHttpsUrl(row.thumbnail),
          sourceUrl,licenseUrl:safeHttpsUrl(row.license_url),
          canStream:Boolean(streamUrl),
          // Aggregator results alone do not prove download or storage rights.
          canDownload:false,streamUrl,
        })];
      });
    },
  };
}

export function createAudiusProvider(fetchImpl:JsonFetch=fetch):AudioProvider {
  return {
    id:'audius',enabled:true,
    async search({query,page,limit}:SearchRequest){
      const url=new URL('https://api.audius.co/v1/tracks/search');
      url.searchParams.set('query',query);url.searchParams.set('limit',String(limit));url.searchParams.set('offset',String((page-1)*limit));
      url.searchParams.set('filter_tracks','public');
      url.searchParams.set('gate_condition','ungated');
      const json=await loadProviderJson(url,fetchImpl) as {data?:unknown};
      return array(json?.data).flatMap((row):ExternalTrack[]=>{
        const externalId=stringField(row.id);
        const sourceUrl=safeHttpsUrl(row.permalink);
        if(!externalId || !/^[a-zA-Z0-9_-]+$/.test(externalId) || !sourceUrl) return [];
        const artwork=row.artwork && typeof row.artwork==='object' ? row.artwork as Record<string,unknown> : {};
        const isPublicStream=row.is_stream_gated===false && row.is_scheduled_release!==true;
        const streamUrl=isPublicStream?'https://api.audius.co/v1/tracks/'+encodeURIComponent(externalId)+'/stream':null;
        return [track('audius',externalId,{
          title:stringField(row.title,'Sin título'),
          artist:stringField(row.user && typeof row.user==='object' ? (row.user as Record<string,unknown>).name : null,'Artista desconocido'),
          album:null,durationSeconds:durationField(row.duration),
          artworkUrl:safeHttpsUrl(artwork['480x480']) ?? safeHttpsUrl(artwork['150x150']),
          sourceUrl,licenseUrl:null,
          // Only explicitly ungated public tracks can use the official stream endpoint.
          canStream:isPublicStream,canDownload:false,streamUrl,
        })];
      });
    },
  };
}
