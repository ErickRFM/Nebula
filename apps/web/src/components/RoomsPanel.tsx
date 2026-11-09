'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Copy, Headphones, Music2, Plus, RadioTower, RefreshCw, Users, X } from 'lucide-react';
import { ApiRequestError, type AccountApi } from '../hooks/useAccount';
import { clockSample, estimateClockOffset, expectedPositionMs, type ClockSample } from '@nebula/room-sync';
import { RoomDevicesPanel } from './RoomDevicesPanel';
import { RoomAcousticQaPanel } from './RoomAcousticQaPanel';
import { RoomRequestsPanel } from './RoomRequestsPanel';
import { useRoomEventStream } from '../lib/room-event-stream';
import { buildRoomInviteLink, roomInviteFromHash } from '../lib/room-invite-link';
import { reorderQueue, withRevisionRetry } from '../lib/room-actions';

type Room = {
  id: string; name: string; mode: 'listening' | 'party'; status: string;
  ownerUserId: string; participantCount: number; revision: number;
  trackId: string | null; shareEnabled: boolean; playbackStatus: 'playing' | 'paused';
  positionMs: number; effectiveAt: string; createdAt: string;
};
type RoomList = { items: Room[] };
type QueueItem = { id: string; trackId: string; title: string; artist: string; position: number };
type RoomDetail = { room: Room; serverNowMs: number };
type RoomMember = { userId: string; role: 'host' | 'listener'; email: string | null; joinedAt: string };

// The server clock offset belongs to the deployment, not to a single room.
// Reusing it avoids a bad first seek (and a visible jump) when switching rooms.
let lastKnownClockOffsetMs = 0;

export function RoomsPanel({ account, onAccount, onLibrary, onActivate }: { account: AccountApi; onAccount: () => void; onLibrary: () => void; onActivate: () => void }) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Room | null>(null);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'listening' | 'party'>('listening');
  const [code, setCode] = useState('');
  const [issuedCode, setIssuedCode] = useState('');
  const [clockOffsetMs, setClockOffsetMs] = useState(lastKnownClockOffsetMs);
  const [clockMetrics, setClockMetrics] = useState<{ rttMs: number; samples: number } | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueBusy, setQueueBusy] = useState(false);
  const queueBusyRef = useRef(false);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [cloudItems, setCloudItems] = useState<{ id: string; title: string; artist: string }[]>([]);
  const [selectedCloudId, setSelectedCloudId] = useState('');
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [loadingCloudItems, setLoadingCloudItems] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const fillInvite = () => {
      const token = roomInviteFromHash(window.location.hash);
      if (token) setCode(token);
    };
    fillInvite();
    window.addEventListener('hashchange', fillInvite);
    return () => window.removeEventListener('hashchange', fillInvite);
  }, []);

  // Confirmations are transient; errors stay until the next action succeeds.
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 7000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // Reopen the last room on return. Only the id is stored; membership and
  // authorization are always re-checked against the API.
  const restoredRoom = useRef(false);
  useEffect(() => {
    if (!restoredRoom.current) {
      restoredRoom.current = true;
      try {
        const saved = window.sessionStorage.getItem('nebula:room');
        if (saved) { setSelectedId(saved); return; }
      } catch { /* storage can be disabled */ }
    }
    try {
      if (selectedId) window.sessionStorage.setItem('nebula:room', selectedId);
      else window.sessionStorage.removeItem('nebula:room');
    } catch { /* storage can be disabled */ }
  }, [selectedId]);

  const refresh = useCallback(async () => {
    if (!account.user) { setRooms([]); setSelected(null); setLoadingRooms(false); return; }
    setLoadingRooms(true);
    try {
      const result = await account.cloudRequest<RoomList>('/v1/rooms');
      setRooms(result.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las salas.');
    } finally { setLoadingRooms(false); }
  }, [account.user?.id, account.cloudRequest]);

  const refreshSelected = useCallback(async () => {
    if (!selectedId || !account.user) return;
    try {
      const result = await account.cloudRequest<RoomDetail>('/v1/rooms/' + encodeURIComponent(selectedId));
      setSelected(result.room);
    } catch (cause) {
      // A temporary 429/503 or network failure must not eject participants
      // from the selected room. Only a confirmed membership loss clears it.
      if (cause instanceof ApiRequestError && (cause.status === 404 || cause.status === 403)) {
        setSelected(null);
        setSelectedId(null);
        void refresh();
      } else {
        setError(cause instanceof Error ? cause.message : 'No se pudo actualizar la sala. Reintentando.');
      }
    }
  }, [selectedId, account.user?.id, account.cloudRequest, refresh]);

  const refreshQueue = useCallback(async () => {
    if (!selectedId || !account.user) { setQueue([]); return; }
    // An in-flight optimistic reorder is newer than this poll.
    if (queueBusyRef.current) return;
    try {
      const result = await account.cloudRequest<{items:QueueItem[]}>('/v1/rooms/' + selectedId + '/queue');
      setQueue(result.items);
    } catch { /* retain the last confirmed queue during transient failures */ }
  }, [selectedId, account.user?.id, account.cloudRequest]);

  // Queue mutations do not bump the room revision, so the queue keeps its own
  // fallback poll. Timeline and membership changes also arrive over the stream.
  useEffect(() => {
    if (!selectedId || !account.user) return;
    void refreshQueue();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refreshQueue(); }, 5000);
    return () => window.clearInterval(timer);
  }, [selectedId, account.user?.id, refreshQueue]);

  const refreshMembers = useCallback(async () => {
    if (!selectedId || !account.user) { setMembers([]); return; }
    try {
      const result = await account.cloudRequest<{items:RoomMember[]}>('/v1/rooms/' + selectedId + '/members');
      setMembers(result.items);
    } catch { /* retain the last confirmed member list during transient failures */ }
  }, [selectedId, account.user?.id, account.cloudRequest]);

  useEffect(() => {
    if (!selectedId || !account.user) { setMembers([]); return; }
    void refreshMembers();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refreshMembers(); }, 20_000);
    return () => window.clearInterval(timer);
  }, [selectedId, account.user?.id, refreshMembers]);

  // Use multiple NTP-style probes rather than estimating clock skew from a
  // single room snapshot. The lowest-RTT half of recent probes limits jitter.
  useEffect(() => {
    if (!selectedId || !account.user) return;
    let cancelled = false;
    const samples: ClockSample[] = [];
    setClockMetrics(null);
    const probe = async () => {
      try {
        const clientSentMs = Date.now();
        const result = await account.cloudRequest<{serverReceivedMs:number;serverSentMs:number}>('/v1/rooms/clock');
        const clientReceivedMs = Date.now();
        if (cancelled) return;
        const sample = clockSample({ clientSentMs, clientReceivedMs, ...result });
        if (!sample) return;
        samples.push(sample);
        if (samples.length > 12) samples.shift();
        const offset = estimateClockOffset(samples);
        if (offset !== null) { lastKnownClockOffsetMs = offset; setClockOffsetMs(offset); }
        setClockMetrics({ rttMs: Math.round(sample.roundTripMs), samples: samples.length });
      } catch { if (!cancelled) setClockMetrics(null); }
    };
    const probeWhenVisible = () => { if (document.visibilityState === 'visible') void probe(); };
    void probe();
    const timer = window.setInterval(probeWhenVisible, 15_000);
    // A backgrounded tab stops sampling; measure once more on return.
    document.addEventListener('visibilitychange', probeWhenVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', probeWhenVisible);
    };
  }, [selectedId, account.user?.id, account.cloudRequest]);

  // The event stream is a hint; REST stays authoritative. Bursts are collapsed
  // so a host changing several fields does not trigger a request per event.
  const liveTimer = useRef<number | undefined>(undefined);
  const scheduleLiveRefresh = useCallback(() => {
    if (liveTimer.current) window.clearTimeout(liveTimer.current);
    liveTimer.current = window.setTimeout(() => {
      void refreshSelected();
      void refreshMembers();
    }, 250);
  }, [refreshSelected, refreshMembers]);
  useEffect(() => () => { if (liveTimer.current) window.clearTimeout(liveTimer.current); }, []);
  const onRoomEvent = useCallback(() => { scheduleLiveRefresh(); }, [scheduleLiveRefresh]);
  useRoomEventStream(selectedId, account.accessToken, onRoomEvent);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!selectedId || !account.user) return;
    void refreshSelected();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refreshSelected(); }, 15_000);
    return () => window.clearInterval(timer);
  }, [selectedId, account.user?.id, refreshSelected]);

  function removeMember(member: RoomMember) {
    if (!selected || !window.confirm('¿Expulsar a esta persona de la sala?')) return;
    void action(async () => {
      await account.cloudRequest('/v1/rooms/' + selected.id + '/members/' + member.userId, { method: 'DELETE' });
      await refreshMembers(); await refreshSelected();
      setNotice('Participante expulsado. Los enlaces de audio ya emitidos caducan como máximo en cinco minutos.');
    });
  }

  function transferHost(member: RoomMember) {
    if (!selected || !window.confirm('¿Transferir la administración de esta sala? Dejarás de ser anfitrión.')) return;
    void action(async () => {
      await account.cloudRequest('/v1/rooms/' + selected.id + '/transfer-host', {
        method: 'POST', body: JSON.stringify({ memberId: member.userId }),
      });
      await refreshSelected(); await refreshMembers();
      setNotice('Anfitrión transferido. Ahora eres participante.');
    });
  }

  function addToQueue() {
    if (!selected || !selectedCloudId || !rightsConfirmed) {
      setError('Confirma que tienes derecho a compartir esta canción antes de añadirla a la cola.');
      return;
    }
    void action(async () => {
      await account.cloudRequest('/v1/rooms/' + selected.id + '/queue', {
        method: 'POST', body: JSON.stringify({ trackId: selectedCloudId, rightsConfirmed: true }),
      });
      await refreshQueue();
      setNotice('Canción agregada a la cola de la sala.');
    });
  }

  // A stale revision is expected when two controls are used quickly. Re-read the
  // authoritative room and retry once instead of surfacing a generic conflict.
  function retryOnRevisionConflict(roomId: string, work: (revision: number) => Promise<unknown>) {
    return withRevisionRetry({
      initialRevision: selected?.revision ?? 0,
      send: work,
      isConflict: cause => cause instanceof ApiRequestError && cause.status === 409,
      reloadRevision: async () => {
        const fresh = await account.cloudRequest<RoomDetail>('/v1/rooms/' + encodeURIComponent(roomId));
        setSelected(fresh.room);
        return fresh.room.revision;
      },
    });
  }

  function moveQueueItem(index: number, direction: -1 | 1) {
    if (!selected || queueBusy) return;
    const ordered = reorderQueue(queue, index, direction);
    if (!ordered) return;
    const confirmed = queue;
    // Reorder locally first: a delayed poll or busy panel must not swallow the
    // tap. The server order is restored if the request fails.
    setQueue(ordered);
    setQueueBusy(true); queueBusyRef.current = true; setError('');
    void (async () => {
      try {
        await account.cloudRequest('/v1/rooms/' + selected.id + '/queue/reorder', {
          method: 'PATCH', body: JSON.stringify({ itemIds: ordered.map(item => item.id) }),
        });
        setNotice('Orden de reproducción actualizado.');
      } catch (cause) {
        setQueue(confirmed);
        setError(cause instanceof Error ? cause.message : 'No se pudo reordenar la cola.');
        void refreshQueue();
      } finally { queueBusyRef.current = false; setQueueBusy(false); }
    })();
  }

  function nextFromQueue() {
    if (!selected) return;
    const roomId = selected.id;
    void action(async () => {
      await retryOnRevisionConflict(roomId, revision => account.cloudRequest('/v1/rooms/' + roomId + '/next', {
        method: 'POST', body: JSON.stringify({ expectedRevision: revision }),
      }));
      await refreshSelected(); await refreshQueue();
      setNotice('Reproducción de la siguiente canción programada.');
    });
  }

  function removeFromQueue(itemId: string) {
    if (!selected) return;
    void action(async () => {
      await account.cloudRequest('/v1/rooms/' + selected.id + '/queue/' + itemId, { method: 'DELETE' });
      await refreshQueue();
    });
  }

  const refreshCloudItems = useCallback(async () => {
    if (!selectedId || !account.user) { setCloudItems([]); return; }
    setLoadingCloudItems(true);
    try {
      const result = await account.cloudRequest<{items:{id:string;title:string;artist:string}[]}>('/v1/library/cloud');
      setCloudItems(result.items);
      setSelectedCloudId(current => current && result.items.some(item => item.id === current) ? current : '');
    } catch (cause) {
      setCloudItems([]);
      setError(cause instanceof Error ? cause.message : 'No se pudo actualizar la música cloud.');
    } finally { setLoadingCloudItems(false); }
  }, [selectedId, account.user?.id, account.cloudRequest]);

  useEffect(() => { void refreshCloudItems(); }, [refreshCloudItems]);

  function startSharedAudio() {
    if (!selected || !selectedCloudId || !rightsConfirmed) {
      setError('Selecciona una canción propia y confirma que tienes derecho a compartirla.');
      return;
    }
    const roomId = selected.id;
    const trackId = selectedCloudId;
    void action(async () => {
      // Select a valid ready track before enabling access to the private audio.
      // If timeline assignment fails, sharing remains disabled rather than looking
      // enabled with no playable track.
      await retryOnRevisionConflict(roomId, revision => account.cloudRequest('/v1/rooms/' + roomId + '/timeline', {
        method: 'POST', body: JSON.stringify({
          expectedRevision: revision, trackId, status: 'playing', positionMs: 0,
          rightsConfirmed: true,
        }),
      }));
      await account.cloudRequest('/v1/rooms/' + roomId + '/sharing', {
        method: 'POST', body: JSON.stringify({ enabled: true, rightsConfirmed: true }),
      });
      await refreshSelected();
      setNotice('Reproducción compartida programada. Cada participante debe activar su audio.');
    });
  }

  function changePlayback(status: 'playing' | 'paused') {
    if (!selected || !selected.trackId) return;
    const positionMs = selected.playbackStatus === 'paused' ? selected.positionMs :
      expectedPositionMs({
        revision: selected.revision, trackId: selected.trackId,
        status: selected.playbackStatus, positionMs: selected.positionMs,
        effectiveServerTimeMs: Date.parse(selected.effectiveAt),
      }, Date.now() + clockOffsetMs);
    const roomId = selected.id;
    const trackId = selected.trackId;
    void action(async () => {
      await retryOnRevisionConflict(roomId, revision => account.cloudRequest('/v1/rooms/' + roomId + '/timeline', {
        method: 'POST', body: JSON.stringify({
          expectedRevision: revision, trackId, status, positionMs: Math.floor(positionMs),
        }),
      }));
      await refreshSelected();
    });
  }

  function disableSharing() {
    if (!selected) return;
    void action(async () => {
      await account.cloudRequest('/v1/rooms/' + selected.id + '/sharing', {
        method: 'POST', body: JSON.stringify({ enabled: false }),
      });
      await refreshSelected();
    });
  }

  useEffect(() => {
    if (!selectedId) return;
    const onVisible = () => { if (document.visibilityState === 'visible') void refreshSelected(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [selectedId, refreshSelected]);

  async function action(work: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await work(); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo completar la operación.'); }
    finally { setBusy(false); }
  }

  function create() {
    if (!name.trim()) { setError('Escribe un nombre para tu sala.'); return; }
    void action(async () => {
      const result = await account.cloudRequest<{ room: { id: string }; inviteCode: string }>('/v1/rooms', {
        method: 'POST', body: JSON.stringify({ name: name.trim(), mode }),
      });
      setSelectedId(result.room.id); setIssuedCode(result.inviteCode); setName('');
      setNotice('Sala creada. Comparte el código con personas que tengan una cuenta NÉBULA.');
    });
  }

  function join() {
    void action(async () => {
      const result = await account.cloudRequest<{ roomId: string }>('/v1/rooms/join', {
        method: 'POST', body: JSON.stringify({ code: code.trim() }),
      });
      setSelectedId(result.roomId); setIssuedCode(''); setCode('');
      if (roomInviteFromHash(window.location.hash)) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      setNotice('Te uniste a la sala.');
    });
  }

  async function shareRoomLink() {
    if (!issuedCode) return;
    const url = buildRoomInviteLink(window.location.href, issuedCode);
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: 'Sala privada NÉBULA', url });
      } else {
        await navigator.clipboard.writeText(url);
        setNotice('Enlace privado copiado. Compártelo únicamente con personas invitadas.');
      }
    } catch (cause) {
      if (cause instanceof Error && cause.name === 'AbortError') return;
      setError('No se pudo compartir el enlace. Copia el código manualmente.');
    }
  }

  function leaveOrClose(room: Room) {
    const isHost = room.ownerUserId === account.user?.id;
    if (!window.confirm(isHost ? '¿Cerrar la sala para todos?' : '¿Salir de la sala?')) return;
    void action(async () => {
      await account.cloudRequest('/v1/rooms/' + room.id + (isHost ? '/close' : '/leave'), { method: 'POST', body: '{}' });
      if (selectedId === room.id) { setSelectedId(null); setSelected(null); setIssuedCode(''); }
      setNotice(isHost ? 'Sala cerrada.' : 'Saliste de la sala.');
    });
  }

  function rotateCode() {
    if (!selected) return;
    void action(async () => {
      const result = await account.cloudRequest<{ inviteCode: string }>('/v1/rooms/' + selected.id + '/invite', {
        method: 'POST', body: '{}',
      });
      setIssuedCode(result.inviteCode);
      setNotice('Nuevo código generado. El anterior ya no funciona.');
    });
  }

  return <section className="content-section rooms-page">
    <div className="heading-with-action">
      <div>
        <div className="eyebrow">ESCUCHA EN COMPAÑÍA</div>
        <h1 className="page-title">Salas NÉBULA</h1>
        <p className="page-description">Crea tu espacio, invita a tus amigos y escuchen música juntos.</p>
        <div className="rooms-overview"><span><RadioTower size={14}/> {rooms.length} {rooms.length===1?"sala":"salas"}</span><span><Users size={14}/> Acceso privado</span><span><Headphones size={14}/> Audio autorizado</span></div>
      </div>
      <RadioTower size={28} aria-hidden="true"/>
    </div>

    {!account.user ? <div className="room-empty glass rooms-signed-out">
      <span className="room-empty-icon"><RadioTower size={27}/></span>
      <h3>Escuchen juntos, cada quien en su dispositivo</h3>
      <p>Las salas son espacios privados: el anfitrión comparte música autorizada desde su biblioteca y la reproducción se sincroniza para quienes están dentro.</p>
      <ul className="room-empty-points">
        <li><Users size={15}/> Acceso solo con cuenta e invitación privada</li>
        <li><Headphones size={15}/> Audio autorizado, sin retransmitir ni eludir DRM</li>
        <li><RadioTower size={15}/> Reloj compartido para escuchar en sincronía</li>
      </ul>
      <button type="button" className="button primary small" onClick={onAccount}>Iniciar sesión para crear una sala</button>
    </div> : <>
      {error && <p className="account-error" role="alert">{error}</p>}
      {notice && <div className="room-notice" role="status">
        <CheckCircle2 size={17} aria-hidden="true"/>
        <span className="room-notice-text">{notice}</span>
        <button type="button" className="room-notice-close" aria-label="Descartar aviso" onClick={()=>setNotice('')}><X size={15}/></button>
      </div>}
      <div className="room-grid">
        <section className="room-card glass" aria-labelledby="room-create-heading">
          <div className="room-card-header"><span className="room-card-icon"><Plus size={21}/></span><div><h2 id="room-create-heading">Crear sala</h2><p>Inicia una sesión privada de escucha.</p></div></div>
          <form className="room-form" onSubmit={event=>{event.preventDefault();create();}}>
            <div className="room-field"><label htmlFor="room-name">Nombre</label><input id="room-name" value={name} maxLength={80} placeholder="Ej. Fiesta en casa" autoComplete="off" onChange={e=>setName(e.target.value)} required/></div>
            <div className="room-field"><label htmlFor="room-mode">Modo de sala</label><select id="room-mode" value={mode} onChange={e=>setMode(e.target.value as 'listening'|'party')}><option value="listening">Escucha compartida</option><option value="party">Party Sound (beta)</option></select></div>
            <p className="room-form-note">Cada participante activa su propia salida de audio.</p>
            <button type="submit" className="button primary" disabled={busy||!name.trim()}><Plus size={16}/> Crear sala</button>
          </form>
        </section>
        <section className="room-card glass" aria-labelledby="room-join-heading">
          <div className="room-card-header"><span className="room-card-icon"><Users size={21}/></span><div><h2 id="room-join-heading">Unirse a una sala</h2><p>Entra con una invitación privada.</p></div></div>
          <form className="room-form" onSubmit={event=>{event.preventDefault();join();}}>
            <div className="room-field"><label htmlFor="room-code">Código privado</label><input id="room-code" value={code} autoComplete="off" spellCheck={false} placeholder="Pega aquí tu código privado" onChange={e=>setCode(e.target.value)}/></div>
            <p className="room-form-note">También puedes abrir el enlace compartido por el anfitrión.</p>
            <button type="submit" className="button secondary" disabled={busy||code.trim().length<20}>Unirme</button>
          </form>
        </section>
      </div>
      <section className="content-section rooms-list-section">
        <div className="section-heading"><div><h2>Mis salas</h2><p className="room-section-description">Tus sesiones y salas compartidas.</p></div>
          <button type="button" className="icon-button glass-chip" disabled={loadingRooms} aria-label="Actualizar salas" onClick={()=>{void refresh();}}><RefreshCw size={18}/></button>
        </div>
        {loadingRooms&&!rooms.length ? <div className="rooms-list glass" role="status" aria-label="Cargando tus salas">
          {[0,1,2].map(index=><div className="room-skeleton-row" key={index} aria-hidden="true">
            <span className="skeleton"/><span className="room-skeleton-lines"><span className="skeleton"/><span className="skeleton"/></span>
          </div>)}
        </div> :
          !rooms.length ? <div className="room-empty glass">
            <span className="room-empty-icon"><Music2 size={27}/></span><h3>Aquí comienza tu próxima sesión</h3>
            <p>Aún no participas en ninguna sala. Crea una, selecciona música de tu biblioteca e invita a tus amigos.</p>
            <button type="button" className="button secondary small" onClick={()=>document.getElementById('room-name')?.focus()}>Crear mi primera sala</button>
          </div> : <div className="rooms-list glass">{rooms.map(room=><div className={'room-entry '+(selectedId===room.id?'is-selected':'')} key={room.id}>
            <button className="room-entry-main" type="button" aria-pressed={selectedId===room.id} onClick={()=>{setSelectedId(room.id);setIssuedCode('');}}>
              <span className="room-entry-icon"><RadioTower size={20}/></span>
              <span className="room-entry-detail"><strong>{room.name}</strong><small>{room.mode==='party'?'Party Sound · beta':'Escucha compartida'} · {room.participantCount} {room.participantCount===1?'participante':'participantes'}</small></span>
              <span className="room-entry-state">{room.ownerUserId===account.user?.id?'Anfitrión':'Invitado'}</span>
            </button>
            <button className="icon-button" type="button" disabled={busy} aria-label={'Salir o cerrar '+room.name} onClick={()=>leaveOrClose(room)}><X size={17}/></button>
          </div>)}</div>}
      </section>
      {selected && selectedId === selected.id && <section className="room-hero glass">
        <div>
          <div className="room-hero-head">
            <h2>{selected.name}</h2>
            <span className="room-entry-state">{selected.ownerUserId===account.user.id?'Anfitrión':'Invitado'}</span>
          </div>
          <p>{selected.participantCount} participante(s) · {selected.mode==='party'?'Party Sound (beta)':'Escucha compartida'} · {selected.trackId ? (selected.playbackStatus==='playing'?'Reproduciendo':'En pausa') : 'Sin canción seleccionada'}</p>
          <div className="room-sync-badges">
            <span className="is-live"><span className="status-dot"/> En vivo · revisión {selected.revision}</span>
            <span>{clockMetrics ? 'Reloj ±' + Math.round(Math.abs(clockOffsetMs)) + ' ms · ' + clockMetrics.rttMs + ' ms RTT' : 'Midiendo reloj…'}</span>
            <span>{selected.shareEnabled ? 'Audio autorizado' : 'Sin audio compartido'}</span>
          </div>
          <details className="room-diagnostics">
            <summary>Detalles técnicos de sincronización</summary>
            <p>El estado de la sala se guarda en PostgreSQL y los cambios llegan por un canal de eventos; la API sigue siendo la fuente de verdad.</p>
            <p>Reloj: {clockMetrics ? 'offset estimado ' + Math.round(clockOffsetMs) + ' ms con ' + clockMetrics.samples + ' muestras y RTT de red ' + clockMetrics.rttMs + ' ms' : 'aún midiendo la conexión'}. Estas cifras no miden el retardo acústico; calibra cada salida en «Dispositivos de la sala».</p>
          </details>
          {selected.ownerUserId===account.user.id && <button type="button" className="button small" disabled={busy} onClick={rotateCode}>Generar nuevo código</button>}
          {issuedCode && <div>
            <p>Código privado (se muestra una sola vez):</p>
            <code style={{overflowWrap:'anywhere'}}>{issuedCode}</code>
            <button type="button" className="icon-button" aria-label="Copiar código" onClick={()=>{void navigator.clipboard.writeText(issuedCode).then(()=>setNotice('Código copiado.')).catch(()=>setError('No se pudo copiar. Selecciona el código manualmente.'));}}><Copy size={17}/></button>
            <button type="button" className="button small" onClick={()=>{void shareRoomLink();}}>Compartir enlace privado</button>
            <p>El enlace abre NÉBULA en Salas y rellena el código. La persona invitada necesita su propia cuenta.</p>
          </div>}
          {selected.ownerUserId===account.user.id && <div>
            <label htmlFor="room-cloud-track">Música propia en Cloudflare R2</label>
            <select id="room-cloud-track" value={selectedCloudId} disabled={loadingCloudItems} onChange={e=>{setSelectedCloudId(e.target.value);setRightsConfirmed(false);}}>
              <option value="">Selecciona una canción</option>
              {cloudItems.map(item=><option key={item.id} value={item.id}>{item.title} — {item.artist}</option>)}
            </select>
            <div className="room-track-assistance">
              {!loadingCloudItems && cloudItems.length===0 && <p role="status">No tienes canciones cloud listas para compartir. Primero sube un archivo MP3 u otro audio permitido a tu nube privada.</p>}
              <button type="button" className="button secondary small" onClick={onLibrary}>Ir a Biblioteca y subir música</button>
              <button type="button" className="button secondary small" disabled={loadingCloudItems} onClick={()=>{void refreshCloudItems();}}>Actualizar canciones de mi nube</button>
            </div>
            <label style={{display:'flex',alignItems:'center',gap:8}}>
              <input type="checkbox" checked={rightsConfirmed} onChange={e=>setRightsConfirmed(e.target.checked)}/>
              Confirmo que tengo derechos para compartir este audio con los participantes.
            </label>
            <button type="button" className="button primary small" disabled={busy || !selectedCloudId || !rightsConfirmed} onClick={startSharedAudio}>Compartir y empezar</button>
            <button type="button" className="button small" disabled={busy || !selectedCloudId || !rightsConfirmed} onClick={addToQueue}>Agregar a cola</button>
            {selected.shareEnabled && <button type="button" className="button small" disabled={busy || !queue.length} onClick={nextFromQueue}>Siguiente de la cola</button>}
            {selected.trackId && <>
              <button type="button" className="button small" disabled={busy} onClick={()=>changePlayback(selected.playbackStatus==='playing'?'paused':'playing')}>{selected.playbackStatus==='playing'?'Pausar para todos':'Reanudar para todos'}</button>
              {selected.shareEnabled && <button type="button" className="button small" disabled={busy} onClick={disableSharing}>Dejar de compartir</button>}
            </>}
          </div>}
          <p className="disclosure">Para escuchar en grupo, el anfitrión primero sube una canción a Cloudflare R2, la selecciona aquí y confirma que puede compartirla. Cada participante debe iniciar sesión, unirse a la sala, activar su salida y pulsar Play. La sincronización lógica no garantiza precisión acústica ni sonido con pantalla bloqueada.</p>
        </div>
      </section>}
      {selected && selectedId===selected.id && <section className="content-section">
        <div className="section-heading"><h2>Escucha aquí</h2><span>{selected.trackId && selected.shareEnabled ? 'Audio disponible' : 'Pendiente de audio'}</span></div>
        <RoomDevicesPanel room={selected} account={account} clockOffsetMs={clockOffsetMs} onActivate={onActivate}/>
      </section>}
      {selected && selectedId===selected.id && <section className="content-section">
        <div className="section-heading"><h2>Participantes</h2><span>{members.length} en la sala</span></div>
        <div className="track-list glass">
          {members.map(member => <div className="track-row" key={member.userId}>
            <span className="track-descriptor">
              <strong>{member.userId === account.user?.id ? 'Tú' : member.email ?? 'Participante ' + member.userId.slice(0, 8)}</strong>
              <small>{member.role === 'host' ? 'Anfitrión' : 'Oyente'}</small>
            </span>
            {selected.ownerUserId === account.user?.id && member.userId !== account.user?.id && <>
              <button type="button" className="button small" disabled={busy} onClick={() => transferHost(member)}>Hacer anfitrión</button>
              <button type="button" className="button secondary small" disabled={busy} onClick={() => removeMember(member)}>Expulsar</button>
            </>}
          </div>)}
        </div>
      </section>}
      {selected && selectedId===selected.id && <section className="content-section">
        <div className="section-heading"><h2>Cola compartida</h2></div>
        <div className="track-list glass">
          {!queue.length ? <p className="empty-note">La cola está vacía.</p> :
            queue.map((item,index)=><div className="track-row" key={item.id}>
              <span className="track-index">{index+1}</span>
              <span className="track-descriptor"><strong>{item.title}</strong><small>{item.artist}</small></span>
              {selected.ownerUserId===account.user?.id && <>
                <button type="button" className="button small" aria-label={'Subir '+item.title} disabled={busy || queueBusy || index===0} onClick={()=>moveQueueItem(index,-1)}>↑</button>
                <button type="button" className="button small" aria-label={'Bajar '+item.title} disabled={busy || queueBusy || index===queue.length-1} onClick={()=>moveQueueItem(index,1)}>↓</button>
                <button type="button" className="icon-button" aria-label={'Quitar '+item.title} disabled={busy} onClick={()=>removeFromQueue(item.id)}><X size={17}/></button>
              </>}
            </div>)}
        </div>
      </section>}
      {selected && selectedId===selected.id && <RoomRequestsPanel roomId={selected.id} hostId={selected.ownerUserId} account={account}/>}
      {selected && selectedId===selected.id && <RoomAcousticQaPanel/>}
    </>}
  </section>;
}
