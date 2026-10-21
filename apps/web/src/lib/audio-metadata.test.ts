import {describe,expect,it} from 'vitest';
import {filenameAudioMetadata,readAudioMetadata} from './audio-metadata';

const named=(name:string,parts:BlobPart[])=>Object.assign(new Blob(parts),{name});
const frame=(id:string,value:string):Uint8Array=>{
  const encoded=new TextEncoder().encode(value);
  const content=new Uint8Array([3,...encoded]);
  const bytes=new Uint8Array(10+content.length);
  bytes.set(new TextEncoder().encode(id));
  bytes[4]=0;bytes[5]=0;bytes[6]=0;bytes[7]=content.length;
  bytes.set(content,10);
  return bytes;
};

describe('client-only audio tags',()=>{
  it('derives artist and title from a normal filename',()=>{
    expect(filenameAudioMetadata('Artist - Great_Song.mp3')).toMatchObject({artist:'Artist',title:'Great Song'});
    expect(filenameAudioMetadata('Live set.flac').title).toBe('Live set');
  });
  it('reads bounded UTF-8 ID3v2.3 tags without loading audio payload',async()=>{
    const frames=[frame('TIT2','Canción real'),frame('TPE1','Artista real'),frame('TALB','Mi álbum'),frame('TCON','Pop')];
    const body=new Uint8Array(frames.reduce((sum,v)=>sum+v.length,0));
    let pos=0;for(const f of frames){body.set(f,pos);pos+=f.length;}
    const header=new Uint8Array([73,68,51,3,0,0,0,0,(body.length>>7)&127,body.length&127]);
    const raw=named('bad - name.mp3',[header,body,new Uint8Array(200)]);
    const calls:{start:number;end:number}[]=[];
    const observed={name:raw.name,size:raw.size,slice:(start:number,end:number)=>{
      calls.push({start,end});return raw.slice(start,end);
    }};
    const tags=await readAudioMetadata(observed);
    expect(tags).toEqual({title:'Canción real',artist:'Artista real',album:'Mi álbum',genre:'Pop'});
    expect(calls.every(x=>x.end-x.start<=512*1024)).toBe(true);
  });
  it('falls back to ID3v1 when v2 tags are missing',async()=>{
    const tag=new Uint8Array(128);
    tag.set(new TextEncoder().encode('TAG'),0);
    tag.set(new TextEncoder().encode('Legacy Song'),3);
    tag.set(new TextEncoder().encode('Legacy Artist'),33);
    tag.set(new TextEncoder().encode('Legacy Album'),63);
    const result=await readAudioMetadata(named('raw.mp3',[new Uint8Array(40),tag]));
    expect(result).toMatchObject({title:'Legacy Song',artist:'Legacy Artist',album:'Legacy Album'});
  });
  it('handles unsupported and malformed media without crashing',async()=>{
    const malformed=named('Grupo - Tema.mp3',[new Uint8Array([73,68,51,3,0,0,127,127,127,127]),new Uint8Array(50)]);
    expect(await readAudioMetadata(malformed)).toMatchObject({title:'Tema',artist:'Grupo'});
    expect(await readAudioMetadata(named('Track.flac',[new Uint8Array(10)]))).toMatchObject({title:'Track'});
  });
});
