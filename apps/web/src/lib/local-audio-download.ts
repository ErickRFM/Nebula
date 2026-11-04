import type {SavedSong} from './local-library';

const EXTENSIONS:Record<string,string>={
 'audio/mpeg':'mp3','audio/mp3':'mp3','audio/wav':'wav','audio/x-wav':'wav',
 'audio/wave':'wav','audio/vnd.wave':'wav','audio/flac':'flac',
 'audio/x-flac':'flac','audio/mp4':'m4a','audio/x-m4a':'m4a',
 'audio/ogg':'ogg','audio/opus':'opus','audio/aac':'aac',
};
const SAFE_EXT=/\.(mp3|wav|flac|m4a|ogg|opus|aac)$/i;
export function exportedSongFilename(song:SavedSong):string{
 const file=song.blob;
 const original=song.filename||(typeof File!=='undefined'&&file instanceof File?file.name:'');
 const knownMime=(song.mimeType||file.type||'').split(';')[0].trim().toLowerCase();
 const knownExt=EXTENSIONS[knownMime];
 const originalExt=original.match(SAFE_EXT)?.[1].toLowerCase();
 // Never claim MP3 when the persisted file is actually another codec.
 const ext=knownExt??originalExt??'audio';
 const label=original.replace(SAFE_EXT,'')||[song.artist,song.title].filter(Boolean).join(' - ')||'cancion';
 const safe=label.normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f]+/g,'-')
  .replace(/^\.+/,'').replace(/\.+$/,'').trim().slice(0,140);
 return (safe||'cancion')+'.'+ext;
}
export function downloadLocalAudioBlob(blob:Blob,filename:string):void{
 if(typeof document==='undefined')throw new Error('Descarga disponible desde el navegador.');
 if(!blob.size)throw new Error('No se puede descargar un archivo vacío.');
 const url=URL.createObjectURL(blob);
 try{
  const anchor=document.createElement('a');
  anchor.href=url;anchor.download=filename;anchor.rel='noopener';
  anchor.style.display='none';
  document.body.appendChild(anchor);
  try{anchor.click();}finally{anchor.remove();}
 }finally{
  // Give the browser download manager time to open the blob before releasing it.
  window.setTimeout(()=>URL.revokeObjectURL(url),60_000);
 }
}
