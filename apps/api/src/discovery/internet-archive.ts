import {createHash} from 'node:crypto';
import {loadProviderJson, type JsonFetch} from './client.js';
import type {AudioProvider,ExternalTrack,SearchRequest} from './types.js';
import {normalizeLicenseUrl,safeHttpsUrl,stringField,durationField} from './types.js';

type SearchDoc={identifier?:unknown;title?:unknown;creator?:unknown};
type ArchiveFile={name?:unknown;source?:unknown;format?:unknown;length?:unknown;private?:unknown;size?:unknown;title?:unknown};
type ItemMetadata={metadata?:{title?:unknown;creator?:unknown;licenseurl?:unknown;mediatype?:unknown;['access-restricted-item']?:unknown};
  files?:unknown};

const AUDIO_EXTENSION=/\.(mp3|ogg|opus|flac|m4a)$/i;
/** Browser-usable audio only. Archived zip packages, movie files and private assets are excluded. */
function audioFileName(value:unknown):string|null{
  if(typeof value!=='string'||value.length>280||!AUDIO_EXTENSION.test(value))return null;
  const segments=value.split('/');
  if(!segments.length||segments.some(part=>!part||part==='.'||part==='..'||part.includes('\\')||part.includes('?')||part.includes('#')))return null;
  return segments.join('/');
}
function archiveFileUrl(identifier:string,name:string):string {
  return 'https://archive.org/download/'+encodeURIComponent(identifier)+'/'+name.split('/').map(encodeURIComponent).join('/');
}
function single(value:unknown):unknown{return Array.isArray(value)?value[0]:value;}
function verifiedLicense(value:unknown):string|null{
  const license=normalizeLicenseUrl(single(value));
  if(!license)return null;
  // An Archive listing by itself does not establish copyright permission.
  // Explicit Creative Commons or public-domain statements are the minimum for in-app stream listing.
  const parsed=new URL(license);
  if(parsed.hostname!=='creativecommons.org'&&parsed.hostname!=='www.creativecommons.org')return null;
  if(!/^\/(licenses\/(by|by-sa|by-nc|by-nc-sa|by-nd|by-nc-nd)\/|publicdomain\/(zero|mark)\/)/.test(parsed.pathname))return null;
  return license;
}
function duration(value:unknown):number|null{
  const direct=durationField(value);
  if(direct!==null)return direct;
  if(typeof value!=='string'||!/^(?:\d{1,2}:)?\d{1,2}:\d{2}$/.test(value))return null;
  const n=value.split(':').map(Number).reduce((sum,part)=>sum*60+part,0);
  return Number.isFinite(n)&&n<1_000_000?n:null;
}
function records(value:unknown):ArchiveFile[]{
  return Array.isArray(value)?value.filter((x):x is ArchiveFile=>x!==null&&typeof x==='object'&&!Array.isArray(x)):[];
}
function searchQuery(input:string):string{
  // Remove Solr operators. User text is always treated as a literal phrase.
  const phrase=input.normalize('NFKC').replace(/[^\p{L}\p{N}\s-]/gu,' ').replace(/\s+/g,' ').trim().slice(0,85);
  if(!phrase)return 'mediatype:audio AND identifier:__nebula_no_match__';
  return 'mediatype:audio AND (title:"'+phrase+'" OR creator:"'+phrase+'")';
}

export function createInternetArchiveProvider(fetchImpl:JsonFetch=fetch):AudioProvider{
  return {id:'internetarchive',enabled:true,
    async search({query,page,limit}:SearchRequest):Promise<ExternalTrack[]>{
      const search=new URL('https://archive.org/advancedsearch.php');
      search.searchParams.set('q',searchQuery(query));
      search.searchParams.set('output','json');
      // Bound Archive metadata fan-out independently from total federated search limit.
      const rows=Math.min(Math.max(limit,1),6);
      search.searchParams.set('rows',String(rows));
      search.searchParams.set('page',String(Math.min(Math.max(page,1),100)));
      for(const field of ['identifier','title','creator'])search.searchParams.append('fl[]',field);
      const result=await loadProviderJson(search,fetchImpl) as {response?:{docs?:unknown}};
      const docs=Array.isArray(result?.response?.docs)?result.response.docs:[];
      const candidates=docs.filter((doc):doc is SearchDoc=>doc!==null&&typeof doc==='object'&&!Array.isArray(doc)).slice(0,rows);
      const settled=await Promise.allSettled(candidates.map(async(doc):Promise<ExternalTrack|null>=>{
        const identifier=doc.identifier;
        if(typeof identifier!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._-]{4,99}$/.test(identifier) || identifier.includes('..'))return null;
        const url=new URL('https://archive.org/metadata/'+encodeURIComponent(identifier));
        const data=await loadProviderJson(url,fetchImpl) as ItemMetadata;
        const metadata=data?.metadata;
        if(!metadata||metadata.mediatype!=='audio'||metadata['access-restricted-item']==='true')return null;
        const license=verifiedLicense(metadata.licenseurl);
        if(!license)return null;
        const available=records(data.files).filter(file=>
          file.private!==true&&file.private!=='true'&&
          (file.source==='original'||file.source==='derivative')&&
          audioFileName(file.name)!==null&&
          Number(file.size)>0&&Number(file.size)<500_000_000
        );
        if(!available.length)return null;
        const candidate=available.find(file=>typeof file.name==='string'&&/\.mp3$/i.test(file.name))??available[0];
        const filename=audioFileName(candidate.name);
        if(!filename)return null;
        const audioUrl=archiveFileUrl(identifier,filename);
        const externalId=createHash('sha256').update(identifier+'\0'+filename).digest('hex').slice(0,40);
        const title=stringField(single(candidate.title),stringField(single(metadata.title),stringField(single(doc.title),'Grabación de archivo')));
        const artist=stringField(single(metadata.creator),stringField(single(doc.creator),'Artista no identificado'));
        return {
          id:'internetarchive:'+externalId,provider:'internetarchive',externalId,title,artist,
          album:stringField(single(metadata.title),'Archivo histórico')||null,
          durationSeconds:duration(candidate.length),
          artworkUrl:'https://archive.org/services/img/'+encodeURIComponent(identifier),
          sourceUrl:'https://archive.org/details/'+encodeURIComponent(identifier),
          licenseUrl:license,canStream:Boolean(safeHttpsUrl(audioUrl)),
          canDownload:false,canStorePrivateCopy:false,streamUrl:safeHttpsUrl(audioUrl),
        };
      }));
      // Isolate inaccessible items so one bad or restricted item does not break search.
      return settled.flatMap(result=>result.status==='fulfilled'&&result.value?[result.value]:[]).slice(0,limit);
    }
  };
}
