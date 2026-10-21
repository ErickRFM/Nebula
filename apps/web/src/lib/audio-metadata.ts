/**
 * Best-effort, local-only music tags for personal file imports.
 * Never reads the whole audio file or sends its content to a metadata service.
 * Supported tags: ID3v2.3/v2.4 text frames and legacy ID3v1 on MP3.
 * Unsupported tags/codecs fall back to a readable filename.
 */
export type AudioMetadata = { title:string; artist:string; album:string; genre:string };
export type NamedAudioBlob = Pick<File, 'name' | 'slice'>;

const FIELD_LIMIT=200;
const MAX_TAG_BYTES=512*1024;
const blank=(value:string):string=>value.replace(/\u0000/g,'').trim().slice(0,FIELD_LIMIT);
const safeText=(value:string):string=>blank(value) || '';

export function filenameAudioMetadata(filename:string):AudioMetadata {
  const clean=filename.split(/[\\/]/).pop()?.replace(/\.[^.]+$/,'').replace(/[_]+/g,' ').trim() || 'Sin título';
  const match=clean.match(/^(.{1,200}?)\s+[-–—]\s+(.{1,200})$/);
  return {
    title:safeText(match?.[2]||clean)||'Sin título',
    artist:safeText(match?.[1]||'')||'Mi música',
    album:'Archivos importados',genre:'Mis canciones',
  };
}

const latin1=(bytes:Uint8Array)=>new TextDecoder('iso-8859-1').decode(bytes);
const synchsafe=(buffer:Uint8Array,offset:number)=>((buffer[offset]&127)<<21)|((buffer[offset+1]&127)<<14)|((buffer[offset+2]&127)<<7)|(buffer[offset+3]&127);
const be32=(buffer:Uint8Array,offset:number)=>((buffer[offset]*0x1000000)+(buffer[offset+1]<<16)+(buffer[offset+2]<<8)+buffer[offset+3])>>>0;

function decodeText(payload:Uint8Array):string {
  if(payload.length<2)return '';
  const encoding=payload[0],data=payload.subarray(1);
  try{
    if(encoding===0)return safeText(latin1(data));
    if(encoding===3)return safeText(new TextDecoder('utf-8').decode(data));
    if(encoding!==1&&encoding!==2)return '';
    let offset=0,be=encoding===2;
    if(encoding===1&&data.length>=2){
      if(data[0]===0xff&&data[1]===0xfe){offset=2;be=false;}
      else if(data[0]===0xfe&&data[1]===0xff){offset=2;be=true;}
    }
    const even=data.subarray(offset,offset+Math.floor((data.length-offset)/2)*2);
    if(!be)return safeText(new TextDecoder('utf-16le').decode(even));
    const swapped=new Uint8Array(even.length);
    for(let i=0;i<even.length;i+=2){swapped[i]=even[i+1];swapped[i+1]=even[i];}
    return safeText(new TextDecoder('utf-16le').decode(swapped));
  }catch{return '';}
}

function parseV2(data:Uint8Array):Partial<AudioMetadata> {
  if(data.length<10||latin1(data.subarray(0,3))!=='ID3')return {};
  const version=data[3],flags=data[5];
  if((version!==3&&version!==4)||(flags&0xc0)!==0||(flags&0x40)!==0)return {};
  const end=Math.min(data.length,10+synchsafe(data,6));
  const result:Partial<AudioMetadata>={};
  for(let pos=10;pos+10<=end;){
    const name=latin1(data.subarray(pos,pos+4));
    if(!/^[A-Z0-9]{4}$/.test(name))break;
    const length=version===4?synchsafe(data,pos+4):be32(data,pos+4);
    if(length<0||length>end-pos-10)break;
    const value=decodeText(data.subarray(pos+10,pos+10+length));
    if(value){
      if(name==='TIT2')result.title=value;
      else if(name==='TPE1')result.artist=value;
      else if(name==='TALB')result.album=value;
      else if(name==='TCON')result.genre=value;
    }
    pos+=10+length;
  }
  return result;
}

function parseV1(data:Uint8Array):Partial<AudioMetadata> {
  if(data.length!==128||latin1(data.subarray(0,3))!=='TAG')return {};
  const title=safeText(latin1(data.subarray(3,33)));
  const artist=safeText(latin1(data.subarray(33,63)));
  const album=safeText(latin1(data.subarray(63,93)));
  return { ...(title?{title}:{}), ...(artist?{artist}:{}), ...(album?{album}:{}) };
}

export async function readAudioMetadata(file:NamedAudioBlob & { size:number }):Promise<AudioMetadata> {
  const fallback=filenameAudioMetadata(file.name);
  if(!/\.mp3$/i.test(file.name)||file.size<10)return fallback;
  try{
    const header=new Uint8Array(await file.slice(0,10).arrayBuffer());
    const length=latin1(header.subarray(0,3))==='ID3' ? 10+synchsafe(header,6) : 0;
    const v2=length>10&&length<=MAX_TAG_BYTES
      ? parseV2(new Uint8Array(await file.slice(0,length).arrayBuffer())) : {};
    // Legacy tags may fill missing fields; modern tags always win.
    const v1=file.size>=128
      ? parseV1(new Uint8Array(await file.slice(file.size-128,file.size).arrayBuffer())) : {};
    return {
      title:v2.title||v1.title||fallback.title,
      artist:v2.artist||v1.artist||fallback.artist,
      album:v2.album||v1.album||fallback.album,
      genre:v2.genre||fallback.genre,
    };
  }catch{return fallback;}
}
