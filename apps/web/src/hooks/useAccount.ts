'use client';
import { useCallback, useEffect, useState } from 'react';

export type Role = 'owner' | 'member';
export type AccountUser = { id: string; email: string; role?: Role };
export type ServerPlaylist = { id: string; name: string; createdAt: string };
export type AccountSession = {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
};
type AuthResponse = { user: AccountUser; accessToken: string; expiresInSeconds: number };

const configuredBase=process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/,'') ?? '';
// Vercel serves /v1 through same-origin Functions; Capacitor requires an explicit remote URL.
export const isAccountApiConfigured=Boolean(configuredBase) || process.env.NEXT_PUBLIC_USE_SAME_ORIGIN_API === 'true';

function apiError(code:string,status:number):string {
  if(status===429) return 'Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.';
  switch(code){
    case 'invalid_credentials': return 'Correo o contraseña incorrectos.';
    case 'account_already_exists': return 'Ya existe una cuenta con este correo.';
    case 'invalid_credentials_format': return 'Revisa el correo y utiliza una contraseña de al menos 12 caracteres.';
    case 'registration_closed':
    case 'registration_disabled': return 'El acceso es privado. Solicita una invitación al propietario.';
    case 'invalid_invite': return 'La invitación no es válida o ha caducado.';
    case 'invalid_invite_payload': return 'Revisa los datos de la invitación.';
    case 'invite_email_mismatch': return 'La invitación pertenece a otro correo electrónico.';
    case 'forbidden': return 'Tu cuenta no tiene permisos para esta acción.';
    case 'invalid_playlist_name': return 'El nombre debe tener entre 1 y 80 caracteres.';
    case 'missing_client_header': return 'Solicitud de sesión no reconocida por el cliente.';
    case 'unauthorized': return 'La sesión caducó. Vuelve a iniciar sesión.';
    default: return 'No se pudo completar la solicitud (HTTP ' + status + ').';
  }
}
export class ApiRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function requestJson<T>(path:string,init:RequestInit={},token?:string):Promise<T> {
  if(!isAccountApiConfigured) throw new Error('Configura NEXT_PUBLIC_API_URL para activar las cuentas.');
  let response:Response;
  try {
    response=await fetch(configuredBase+path,{
      ...init,
      cache:'no-store',
      // The HttpOnly refresh cookie must travel with every account request.
      credentials:'include',
      headers:{
        'Content-Type':'application/json',
        'x-nebula-client':'web',
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
    throw new ApiRequestError(apiError(code,response.status),response.status);
  }
  return payload as T;
}

export function useAccount() {
  const [user,setUser]=useState<AccountUser|null>(null);
  // The access token stays in memory only. The refresh token lives in an HttpOnly cookie
  // and is never readable from JavaScript.
  const [accessToken,setAccessToken]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [restoring,setRestoring]=useState(true);
  const [registrationOpen,setRegistrationOpen]=useState(false);
  const [error,setError]=useState('');
  const [serverPlaylists,setServerPlaylists]=useState<ServerPlaylist[]>([]);
  const [playlistsBusy,setPlaylistsBusy]=useState(false);
  const [sessions,setSessions]=useState<AccountSession[]>([]);

  useEffect(()=>{
    if(!isAccountApiConfigured) {setRestoring(false); return;}
    void fetch(configuredBase+'/v1/auth/config',{cache:'no-store'})
      .then(r=>r.ok?r.json():null)
      .then(data=>setRegistrationOpen(data?.registrationOpen===true))
      .catch(()=>setRegistrationOpen(false));
  },[]);

  // Restore a persistent session from the HttpOnly refresh cookie on first load.
  useEffect(()=>{
    if(!isAccountApiConfigured){setRestoring(false);return;}
    let cancelled=false;
    (async()=>{
      try {
        const data=await requestJson<{accessToken:string}>('/v1/auth/refresh',{method:'POST',body:'{}'});
        if(!cancelled && data.accessToken) setAccessToken(data.accessToken);
      } catch { /* no active session */ }
      finally { if(!cancelled) setRestoring(false); }
    })();
    return ()=>{cancelled=true;};
  },[]);

  useEffect(()=>{
    if(!accessToken || user) return;
    let cancelled=false;
    (async()=>{
      try {
        const data=await requestJson<{user:AccountUser}>('/v1/me',{},accessToken);
        if(!cancelled) setUser(data.user);
      } catch(err) { if(!cancelled) setError(err instanceof Error?err.message:'No se pudo obtener la cuenta.'); }
    })();
    return ()=>{cancelled=true;};
  },[accessToken,user]);

  const refreshPlaylists=useCallback(async (token:string)=>{
    setPlaylistsBusy(true);
    try {
      const data=await requestJson<{items:ServerPlaylist[]}>('/v1/playlists',{},token);
      setServerPlaylists(data.items);
      setError('');
    } catch(err) {setError(err instanceof Error?err.message:'No se pudo obtener la biblioteca de cuenta.');}
    finally {setPlaylistsBusy(false);}
  },[]);

  const loadSessions=useCallback(async (token:string)=>{
    try {
      const data=await requestJson<{items:AccountSession[]}>('/v1/auth/sessions',{},token);
      setSessions(data.items);
    } catch { /* sessions are best-effort */ }
  },[]);

  useEffect(()=>{
    if(accessToken){ void refreshPlaylists(accessToken); void loadSessions(accessToken); }
    else { setServerPlaylists([]); setSessions([]); }
  },[accessToken,refreshPlaylists,loadSessions]);

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

  const acceptInvite=useCallback(async (token:string,email:string,password:string):Promise<boolean>=>{
    setBusy(true);setError('');
    try {
      const data=await requestJson<AuthResponse>('/v1/auth/accept-invite',{
        method:'POST',body:JSON.stringify({token:token.trim(),email:email.trim().toLowerCase(),password}),
      });
      if(!data.accessToken||!data.user?.id) throw new Error('La invitación devolvió una sesión inválida.');
      setAccessToken(data.accessToken);setUser(data.user);
      return true;
    } catch(err) {setError(err instanceof Error?err.message:'No se pudo aceptar la invitación.');return false;}
    finally {setBusy(false);}
  },[]);

  const logout=useCallback(async()=>{
    try { await requestJson<unknown>('/v1/auth/logout',{method:'POST'},accessToken ?? undefined); }
    catch { /* clear locally even if the server is unreachable */ }
    setAccessToken(null);setUser(null);setServerPlaylists([]);setSessions([]);setError('');
  },[accessToken]);

  const revokeSession=useCallback(async (id:string):Promise<boolean>=>{
    if(!accessToken) return false;
    try {
      await requestJson<unknown>('/v1/auth/sessions/'+encodeURIComponent(id),{method:'DELETE'},accessToken);
      setSessions((current)=>current.filter((item)=>item.id!==id));
      return true;
    } catch(err) {setError(err instanceof Error?err.message:'No se pudo cerrar la sesión.');return false;}
  },[accessToken]);

  const revokeOtherSessions=useCallback(async ():Promise<boolean>=>{
    if(!accessToken) return false;
    setBusy(true);setError('');
    try {
      await requestJson<unknown>('/v1/auth/sessions/revoke-all',{method:'POST'},accessToken);
      await loadSessions(accessToken);
      return true;
    } catch(err) {setError(err instanceof Error?err.message:'No se pudieron cerrar las demás sesiones.');return false;}
    finally {setBusy(false);}
  },[accessToken,loadSessions]);

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


  const cloudRequest=useCallback(async <T,>(path:string,init:RequestInit={}):Promise<T>=>{
    if(!accessToken) throw new Error('Inicia sesión para usar tu biblioteca privada.');
    return requestJson<T>(path,init,accessToken);
  },[accessToken]);

  return {
    configured:isAccountApiConfigured,user,accessToken,busy,restoring,error,registrationOpen,
    serverPlaylists,playlistsBusy,sessions,login,acceptInvite,logout,
    revokeSession,revokeOtherSessions,createServerPlaylist,removeServerPlaylist,cloudRequest,setError,
  };
}

export type AccountApi=ReturnType<typeof useAccount>;
