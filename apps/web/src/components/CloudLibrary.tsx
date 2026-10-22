'use client';
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Cloud, CloudOff, CloudUpload, Download, Play, Trash2 } from 'lucide-react';
import { ApiRequestError, type AccountApi } from '../hooks/useAccount';
import type { Track } from '../lib/catalog';
import { artwork } from '../lib/catalog';
import { putPrivateAudio } from '../lib/r2-upload';
import { retrieveAuthorizedAudio } from '../lib/authorized-web-audio';
import { readAudioMetadata } from '../lib/audio-metadata';
import { hashAudioFile } from '../lib/audio-hash';
import {embeddedCoverFile, validatedCoverFile} from '../lib/cloud-artwork';
import {PrivateCloudCover} from './PrivateCloudCover';

type CloudTrack = {
  id: string; title: string; artist: string; album?:string; genre?:string; mimeType: string;
  byteSize: number; createdAt: string; coverUrl?:string|null;
};
type CloudList = { pendingItems: CloudTrack[]; configured: boolean };
type CloudSearchPage={items:CloudTrack[];nextCursor:string|null;hasMore:boolean};
type UploadTicket = { id: string; uploadUrl: string; contentType: string; expiresInSeconds: number };

const MAX_BYTES = 100 * 1024 * 1024;
// The API permits 20 upload reservations per minute for an authenticated account.
const MAX_BATCH_FILES = 20;
const supported = /\.(mp3|m4a|wav|ogg|opus|flac|aac)$/i;

export function CloudLibrary({
  account, onPlay,
}: {
  account: AccountApi;
  onPlay: (track: Track) => void;
}) {
  const [items, setItems] = useState<CloudTrack[]>([]);
  const [nextCursor,setNextCursor]=useState<string|null>(null);
  const [moreBusy,setMoreBusy]=useState(false);
  const [pendingItems,setPendingItems]=useState<CloudTrack[]>([]);
  const [configured, setConfigured] = useState(false);
  const [targetPlaylist, setTargetPlaylist] = useState('');
  const [remoteAudioUrl,setRemoteAudioUrl]=useState('');
  const [importAuthorized,setImportAuthorized]=useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadProgress,setUploadProgress]=useState<number|null>(null);
  const uploadController=useRef<AbortController|null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [coverFailures,setCoverFailures]=useState(0);

  const refresh = useCallback(async () => {
    if (!account.user) { setItems([]); setNextCursor(null); setPendingItems([]); setConfigured(false); return; }
    setLoading(true);
    try {
      const [result,page]=await Promise.all([
        account.cloudRequest<CloudList>('/v1/library/cloud/pending'),
        account.cloudRequest<CloudSearchPage>('/v1/library/cloud/search?limit=50'),
      ]);
      setItems(page.items);
      setNextCursor(page.nextCursor);
      setPendingItems(result.pendingItems??[]);
      setConfigured(result.configured);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo consultar tu biblioteca en la nube.');
    } finally { setLoading(false); }
  }, [account.user?.id, account.cloudRequest]);

  useEffect(() => { void refresh(); }, [refresh]);
  async function loadMore(){
    if(!nextCursor||loading||moreBusy)return;
    setMoreBusy(true);setError('');
    try{
      const page=await account.cloudRequest<CloudSearchPage>('/v1/library/cloud/search?limit=50&cursor='+encodeURIComponent(nextCursor));
      setItems(current=>{
        const existing=new Set(current.map(item=>item.id));
        return [...current,...page.items.filter(item=>!existing.has(item.id))];
      });
      setNextCursor(page.nextCursor);
    }catch(failure){setError(failure instanceof Error?failure.message:'No se pudieron cargar más canciones.');}
    finally{setMoreBusy(false);}
  }


  async function uploadCover(itemId:string,file:File,controller:AbortController):Promise<void>{
    if(!await validatedCoverFile(file))throw new Error('La portada debe ser PNG o JPEG real de 12 bytes a 256 KB.');
    if(controller.signal.aborted)throw new Error('Carga cancelada.');
    const base='/v1/library/cloud/'+encodeURIComponent(itemId);
    const ticket=await account.cloudRequest<{ticket:string;uploadUrl:string;contentType:string}>(base+'/cover-ticket',{
      method:'POST',body:JSON.stringify({contentType:file.type,size:file.size}),
    });
    await putPrivateAudio(ticket.uploadUrl,ticket.contentType,file,controller.signal,()=>{});
    if(controller.signal.aborted)throw new Error('Carga cancelada.');
    await account.cloudRequest(base+'/cover-complete',{
      method:'POST',body:JSON.stringify({ticket:ticket.ticket}),
    });
  }

  async function changeCover(itemId:string,file:File|undefined){
    if(!file||busy)return;
    const controller=new AbortController();
    uploadController.current=controller;
    setBusy(true);setError('');setCoverFailures(0);
    try{
      await uploadCover(itemId,file,controller);
      setMessage('Portada guardada en R2. Se verá al actualizar la biblioteca.');
      await refresh();
    }catch(failure){
      setError(failure instanceof Error?failure.message:'No se pudo guardar la portada.');
    }finally{
      uploadController.current=null;setBusy(false);
    }
  }

  async function uploadFiles(files:File[], controller=new AbortController()):Promise<boolean> {
    if (!files.length) return false;
    if (!account.user) { setError('Inicia sesión para subir canciones a la nube.'); return false; }
    if(files.length>MAX_BATCH_FILES){setError('Seleccionaste '+files.length+' archivos. El máximo por lote es '+MAX_BATCH_FILES+' para evitar límites del servidor. Divide la carpeta en varios lotes; no se omitirá ninguna canción silenciosamente.');return false;}
    uploadController.current=controller;
    setBusy(true);setError('');setMessage('');setUploadProgress(0);
    let uploaded=0;
    let duplicates=0;
    let artworkFailed=0;
    setCoverFailures(0);
    try{
      for(const file of files){
        if(controller.signal.aborted)throw new Error('Carga cancelada.');
        if(!supported.test(file.name)||file.size<1||file.size>MAX_BYTES)
          throw new Error('Archivo no compatible: '+file.name+'. Usa MP3, M4A, WAV, OGG, OPUS, FLAC o AAC, máximo 100 MB.');
        setUploadProgress(0);
        setMessage('Subiendo '+(uploaded+1)+' de '+files.length+': '+file.name);
        const tags=await readAudioMetadata(file);
        setMessage('Calculando huella SHA-256 para evitar duplicados: '+file.name);
        const sha256=await hashAudioFile(file,controller.signal);
        if(controller.signal.aborted)throw new Error('Carga cancelada.');
        let ticket:UploadTicket;
        try{
          ticket=await account.cloudRequest<UploadTicket>('/v1/library/cloud/uploads',{
            method:'POST',body:JSON.stringify({filename:file.name,size:file.size,title:tags.title,artist:tags.artist,album:tags.album,genre:tags.genre,sha256}),
          });
        }catch(failure){
          if(failure instanceof ApiRequestError && failure.status===409){
            duplicates++;
            setMessage(file.name+' ya estaba en tu nube; omitiendo duplicado ('+duplicates+').');
            continue;
          }
          throw failure;
        }
        try{
          if(controller.signal.aborted)throw new Error('Carga cancelada.');
          await putPrivateAudio(ticket.uploadUrl,ticket.contentType,file,controller.signal,setUploadProgress);
          if(controller.signal.aborted)throw new Error('Carga cancelada.');
          await account.cloudRequest('/v1/library/cloud/'+encodeURIComponent(ticket.id)+'/complete',{
            method:'POST',body:'{}',
          });
          // Artwork is optional. A broken picture must not delete an uploaded song.
          if(tags.coverDataUrl){
            const picture=embeddedCoverFile(tags.coverDataUrl);
            if(picture){
              try{await uploadCover(ticket.id,picture,controller);}
              catch{artworkFailed++;setCoverFailures(artworkFailed);}
            }
          }
          uploaded++;
        }catch(failure){
          // Revoke the pending ticket and delete an incomplete R2 object if present.
          await account.cloudRequest('/v1/library/cloud/'+encodeURIComponent(ticket.id),{method:'DELETE'}).catch(()=>{});
          if(controller.signal.aborted)throw new Error('Carga cancelada.');
          if(failure instanceof Error&&failure.message.startsWith('r2_upload_http_'))
            throw new Error('R2 rechazó la subida de '+file.name+' (HTTP '+failure.message.split('_').pop()+').');
          if(failure instanceof Error&&failure.message==='r2_upload_network_failed')
            throw new Error('Falló la conexión de subida. Revisa tu red y la política CORS del bucket R2.');
          throw failure;
        }
      }
      setMessage(uploaded+' canción(es) nuevas en tu nube; '+duplicates+' duplicado(s) omitidos.'+(artworkFailed?' '+artworkFailed+' portada(s) pendientes.':''));
      return true;
    }catch(failure){
      setError(failure instanceof Error?failure.message:'Error al subir canciones.');
      if(uploaded||duplicates)setMessage(uploaded+' canción(es) nuevas; '+duplicates+' duplicado(s) detectados antes del error.');
      return false;
    }finally{
      uploadController.current=null;
      setUploadProgress(null);
      await refresh();
      setBusy(false);
    }
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const files=Array.from(event.target.files??[]);
    event.target.value='';
    await uploadFiles(files);
  }

  async function importFromWeb(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(busy||!configured||!account.user)return;
    if(!importAuthorized){setError('Confirma que puedes descargar y guardar este audio.');return;}
    const controller=new AbortController();
    uploadController.current=controller;
    setBusy(true);setUploadProgress(0);setError('');setMessage('Recibiendo el archivo de audio autorizado…');
    try {
      const file=await retrieveAuthorizedAudio(remoteAudioUrl,controller.signal,pct=>setUploadProgress(pct));
      if(controller.signal.aborted)throw new Error('Carga cancelada.');
      const complete=await uploadFiles([file],controller);
      if(complete){setRemoteAudioUrl('');setImportAuthorized(false);}
    }catch(failure){
      setError(failure instanceof Error?failure.message:'No se pudo importar el audio.');
    }finally{
      if(uploadController.current===controller){uploadController.current=null;setUploadProgress(null);setBusy(false);}
    }
  }

  async function play(item: CloudTrack) {
    setError('');
    try {
      const result = await account.cloudRequest<{ url: string; expiresInSeconds:number }>('/v1/library/cloud/' + encodeURIComponent(item.id) + '/play');
      onPlay({
        id: 'cloud-' + item.id,
        title: item.title,
        artist: item.artist,
        album: item.album||'NÉBULA Cloud',
        genre: item.genre||'Mi música',
        cover: item.coverUrl||artwork[0],
        duration: '--:--',
        audioUrl: result.url,
        source: 'external',
        signedAudioExpiresInSeconds:result.expiresInSeconds,
        renewAudioUrl:()=>account.cloudRequest<{url:string;expiresInSeconds:number}>('/v1/library/cloud/'+encodeURIComponent(item.id)+'/play'),
      });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo reproducir la canción.');
    }
  }

  async function download(item: CloudTrack) {
    setError('');
    try {
      const ticket=await account.cloudRequest<{url:string;filename:string}>('/v1/library/cloud/'+encodeURIComponent(item.id)+'/download');
      // Signed R2 GET carries attachment Content-Disposition; no audio travels through Vercel.
      window.location.assign(ticket.url);
    } catch(failure) {
      setError(failure instanceof Error?failure.message:'No fue posible descargar tu archivo.');
    }
  }

  async function remove(item: CloudTrack) {
    if (!window.confirm('¿Eliminar ' + item.title + ' de tu nube privada?')) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await account.cloudRequest('/v1/library/cloud/' + encodeURIComponent(item.id), { method: 'DELETE' });
      await refresh();
      setMessage('Canción eliminada de tu nube.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo eliminar la canción.');
    } finally { setBusy(false); }
  }

  return <section className="content-section cloud-library">
    <div className="section-heading">
      <h2><Cloud size={21}/> Mi música en la nube</h2>
      <span className="server-pill">{items.length}{nextCursor?'+':''} canciones · Cloudflare R2</span>
    </div>
    {!account.configured || !account.user ? <div className="disclosure">
      <CloudOff size={18}/> Inicia sesión en Cuenta para guardar y escuchar tus canciones desde cualquier dispositivo.
    </div> : <>
      <div className="cloud-actions glass">
        <div>
          <strong>Biblioteca privada</strong>
          <p>Sube tus canciones o una carpeta (máximo 20 archivos por lote). Leemos etiquetas MP3 en tu dispositivo; el audio va directo al R2 privado.</p>
        </div>
        <label className={'button primary small' + (busy || !configured ? ' cloud-disabled' : '')}>
          <CloudUpload size={17}/> {busy ? 'Subiendo…' : 'Subir a la nube'}
          <input className="file-input" type="file" multiple accept="audio/*,.mp3,.m4a,.wav,.ogg,.opus,.flac,.aac"
            disabled={busy || !configured} onChange={(event) => { void upload(event); }}
            aria-label="Subir canciones privadas a Cloudflare R2"/>
        </label>
        <label className={'button secondary small'+(busy || !configured ? ' cloud-disabled' : '')}>
          Importar carpeta
          <input className="file-input" type="file" multiple accept="audio/*,.mp3,.m4a,.wav,.ogg,.opus,.flac,.aac"
            ref={element=>{if(element){element.setAttribute('webkitdirectory','');element.setAttribute('directory','');}}}
            disabled={busy||!configured} onChange={event=>{void upload(event);}} aria-label="Importar una carpeta de música propia a R2"/>
        </label>
        {busy && <button className="button secondary small" type="button" onClick={()=>uploadController.current?.abort()}>Cancelar carga</button>}
      </div>
      <form className="authorized-web-import glass" onSubmit={event=>{void importFromWeb(event);}}>
        <div><strong>Importar un archivo de audio desde la web</strong>
          <p>Pega el enlace HTTPS directo de un MP3, FLAC u otro audio permitido, no la URL de una página, video de YouTube ni un convertidor. La descarga ocurre en tu navegador y la subida en tu R2 privado.</p>
        </div>
        <label htmlFor="authorized-audio-url">URL directa del archivo</label>
        <input id="authorized-audio-url" type="url" required value={remoteAudioUrl}
          onChange={event=>setRemoteAudioUrl(event.target.value)}
          placeholder="https://sitio-permitido.example/musica/mi-cancion.mp3" disabled={busy||!configured}
          aria-describedby="authorized-audio-help"/>
        <label className="authorized-web-confirm">
          <input type="checkbox" checked={importAuthorized} onChange={event=>setImportAuthorized(event.target.checked)}
            disabled={busy||!configured}/>
          Confirmo que puedo descargar y almacenar este archivo en mi biblioteca privada.
        </label>
        <button type="submit" className="button primary small"
          disabled={busy||!configured||!remoteAudioUrl.trim()||!importAuthorized}>Importar a NÉBULA Cloud</button>
        <p id="authorized-audio-help" className="disclosure">Máximo 100 MB; la fuente debe permitir CORS. No se evitan protecciones, publicidad ni restricciones del proveedor.</p>
      </form>
      {busy && <div className="cloud-upload-progress"><progress max={100} value={uploadProgress??0} aria-label="Progreso de carga de música"/><span>{uploadProgress??0}%</span></div>}
      {!configured && !loading && <p className="disclosure">El almacenamiento R2 todavía no está disponible en la API.</p>}
      {loading && <p className="disclosure">Sincronizando tu biblioteca privada…</p>}
      {pendingItems.length>0 && <div className="cloud-actions glass"><div><strong>Cargas pendientes ({pendingItems.length})</strong><p>Puedes limpiar intentos interrumpidos y volver a seleccionar tus archivos. No se muestran como canciones listas.</p></div><div>{pendingItems.map(item=><button key={item.id} type="button" className="button secondary small" disabled={busy} onClick={()=>{void account.cloudRequest('/v1/library/cloud/'+encodeURIComponent(item.id),{method:'DELETE'}).then(()=>refresh()).catch(()=>setError('No se pudo limpiar la carga pendiente.'));}}>Descartar {item.title}</button>)}</div></div>}
      {message && <p className="disclosure" role="status">{message}</p>}
      {coverFailures>0 && <p className="disclosure">Puedes cambiar las portadas pendientes individualmente, sin repetir la carga de audio.</p>}
      {error && <p className="account-error" role="alert">{error}</p>}
      {account.serverPlaylists.length>0 && <div className="cloud-actions glass"><label htmlFor="cloud-target-playlist">Añadir canciones a playlist de cuenta</label><select id="cloud-target-playlist" value={targetPlaylist} onChange={(event)=>setTargetPlaylist(event.target.value)}><option value="">Selecciona una playlist</option>{account.serverPlaylists.map((list)=><option key={list.id} value={list.id}>{list.name}</option>)}</select></div>}
      <div className="track-list glass">
        {!items.length ? <p className="empty-note">Tu nube todavía no tiene canciones. Sube un MP3 o FLAC para empezar.</p> :
          items.map((item) => <div className="track-row" key={item.id}>
            <button type="button" className="track-main" disabled={busy} onClick={() => { void play(item); }}>
              <PrivateCloudCover key={item.id} trackId={item.id} coverUrl={item.coverUrl} account={account} fallback={<span className="cloud-track-icon"><Play size={17}/></span>}/>
              <span className="track-descriptor"><strong>{item.title}</strong><small>{item.artist} · {(item.byteSize / 1048576).toFixed(1)} MB</small></span>
            </button>
            <span className="track-album">{item.album||'NÉBULA Cloud'}</span>
            <button type="button" className="button small" disabled={busy} aria-pressed={account.accountFavorites.some(f=>f.cloudTrackId===item.id)} onClick={()=>{void account.toggleAccountFavorite('cloud',item.id).then(ok=>{if(ok)setMessage('Favoritos de cuenta actualizados.');else setError('No se pudo guardar el favorito.');});}}>{account.accountFavorites.some(f=>f.cloudTrackId===item.id)?'♥ Favorito':'♡ Favorito'}</button>
            {account.serverPlaylists.length>0 && <button type="button" className="button small" disabled={busy || !targetPlaylist} onClick={()=>{void account.addAccountPlaylistItem(targetPlaylist,'cloud',item.id).then((ok)=>{if(ok)setMessage('Canción añadida a la playlist de tu cuenta.');else setError('No fue posible añadir esta canción a la playlist.');});}}>Añadir a lista</button>}
            <label className={'button secondary small'+(busy?' cloud-disabled':'')}>
              Cambiar portada
              <input type="file" className="file-input" accept="image/png,image/jpeg" disabled={busy}
                aria-label={'Elegir portada PNG o JPEG para '+item.title}
                onChange={e=>{const file=e.target.files?.[0];e.target.value='';void changeCover(item.id,file);}}/>
            </label>
            <button type="button" className="button secondary small" disabled={busy} aria-label={'Descargar '+item.title+' de mi nube'} onClick={()=>{void download(item);}}><Download size={15}/> Descargar</button>
            <button type="button" className="icon-button" disabled={busy} title="Eliminar de R2"
              aria-label={'Eliminar ' + item.title + ' de la nube'} onClick={() => { void remove(item); }}>
              <Trash2 size={17}/>
            </button>
          </div>)}
      </div>
      {nextCursor&&<button type="button" className="button secondary small" disabled={loading||moreBusy||busy} onClick={()=>{void loadMore();}}>{moreBusy?'Cargando…':'Mostrar más canciones'}</button>}
      <p className="disclosure">La música se almacena en un bucket privado. Los enlaces de reproducción expiran automáticamente y se renuevan para la pista activa.</p>
    </>}
  </section>;
}
