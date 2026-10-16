'use client';
import { useCallback, useEffect, useState } from 'react';

export type AccountUser = { id: string; email: string };
export type ServerPlaylist = { id: string; name: string; createdAt: string };
type AuthResponse = { user: AccountUser; accessToken: string; expiresInSeconds: number };

const configuredBase=process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/,'') ?? '';
export const isAccountApiConfigured=Boolean(configuredBase);

function apiError(code:string,status:number):string {
  if(status===429) return 'Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.';
  switch(code){
    case 'invalid_credentials': return 'Correo o contraseña incorrectos.';
    case 'account_already_exists': return 'Ya existe una cuenta con este correo.';
    case 'invalid_credentials_format': return 'Revisa el correo y utiliza una contraseña de al menos 12 caracteres.';
    case 'invalid_playlist_name': return 'El nombre debe tener entre 1 y 80 caracteres.';
    case 'unauthorized': return 'La sesión caducó. Vuelve a iniciar sesión.';
    default: return 'No se pudo completar la solicitud (HTTP ' + status + ').';
  }
}
async function requestJson<T>(path:string,init:RequestInit={},token?:string):Promise<T> {
  if(!configuredBase) throw new Error('Configura NEXT_PUBLIC_API_URL para activar las cuentas.');
  let response:Response;
  try {
    response=await fetch(configuredBase+path,{
      ...init,
      cache:'no-store',
      headers:{
        'Content-Type':'application/json',
        ...(token?{Authorization:'Bearer '+token}:{}),
        ...init.headers,
      },
    });
  } catch {
    throw new Error('No se pudo conectar con la API. Comprueba que el servidor esté en funcionamiento.');
  }
  const payload= response.status===204 ? {} : await response.json().catch(()=>({}));
  if(!response.ok){
    const code=typeof payload?.error==='string' ? payload.error : 'unknown';
    throw new Error(apiError(code,response.status));
  }
  return payload as T;
}

export function useAccount() {
  const [user,setUser]=useState<AccountUser|null>(null);
  // Never store bearer tokens in localStorage, IndexedDB, URLs or persistent cookies.
  const [accessToken,setAccessToken]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [registrationOpen,setRegistrationOpen]=useState(false);
  const [error,setError]=useState('');
  const [serverPlaylists,setServerPlaylists]=useState<ServerPlaylist[]>([]);
  const [playlistsBusy,setPlaylistsBusy]=useState(false);

  useEffect(()=>{
    if(!configuredBase)return;
    void fetch(configuredBase+'/v1/auth/config',{cache:'no-store'})
      .then(r=>r.ok?r.json():null)
      .then(data=>setRegistrationOpen(data?.registrationOpen===true))
      .catch(()=>setRegistrationOpen(false));
  },[]);

  const refreshPlaylists=useCallback(async (token:string)=>{
    setPlaylistsBusy(true);
    try {
      const data=await requestJson<{items:ServerPlaylist[]}>('/v1/playlists',{},token);
      setServerPlaylists(data.items);
      setError('');
    } catch(err) {setError(err instanceof Error?err.message:'No se pudo obtener la biblioteca de cuenta.');}
    finally {setPlaylistsBusy(false);}
  },[]);

  useEffect(()=>{
    if(accessToken) void refreshPlaylists(accessToken);
    else setServerPlaylists([]);
  },[accessToken,refreshPlaylists]);

  const login=useCallback(async (mode:'login'|'register',email:string,password:string):Promise<boolean>=>{
    setBusy(true);setError('');
    try {
      const data=await requestJson<AuthResponse>('/v1/auth/'+mode,{
        method:'POST',body:JSON.stringify({email:email.trim().toLowerCase(),password}),
      });
      if(!data.accessToken||!data.user?.id) throw new Error('El servidor devolvió una respuesta de sesión inválida.');
      setAccessToken(data.accessToken);
      setUser(data.user);
      return true;
    } catch(err) {setError(err instanceof Error?err.message:'No se pudo iniciar sesión.');return false;}
    finally {setBusy(false);}
  },[]);

  const logout=useCallback(()=>{
    setAccessToken(null);setUser(null);setServerPlaylists([]);setError('');
  },[]);

  const createServerPlaylist=useCallback(async (name:string):Promise<boolean>=>{
    if(!accessToken) {setError('Inicia sesión para usar tu cuenta.');return false;}
    setPlaylistsBusy(true);setError('');
    try {
      const data=await requestJson<{playlist:ServerPlaylist}>('/v1/playlists',{method:'POST',body:JSON.stringify({name})},accessToken);
      setServerPlaylists((current)=>[data.playlist,...current]);
      return true;
    } catch(err) {setError(err instanceof Error?err.message:'No se pudo crear la playlist.');return false;}
    finally {setPlaylistsBusy(false);}
  },[accessToken]);

  const removeServerPlaylist=useCallback(async (id:string):Promise<boolean>=>{
    if(!accessToken) return false;
    setPlaylistsBusy(true);setError('');
    try {
      await requestJson<unknown>('/v1/playlists/'+encodeURIComponent(id),{method:'DELETE'},accessToken);
      setServerPlaylists((current)=>current.filter((item)=>item.id!==id));
      return true;
    } catch(err) {setError(err instanceof Error?err.message:'No se pudo eliminar la playlist.');return false;}
    finally {setPlaylistsBusy(false);}
  },[accessToken]);

  return {
    configured:isAccountApiConfigured,user,accessToken,busy,error,registrationOpen,
    serverPlaylists,playlistsBusy,login,logout,createServerPlaylist,removeServerPlaylist,setError,
  };
}

export type AccountApi=ReturnType<typeof useAccount>;
