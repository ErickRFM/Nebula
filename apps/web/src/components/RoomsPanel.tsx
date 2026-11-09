'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Copy, Crown, Headphones, Link2, ListMusic, Music2, Pause, Play, Plus, QrCode, RadioTower, RefreshCw, Share2, SkipForward, Users, X } from 'lucide-react';
import { ApiRequestError, type AccountApi } from '../hooks/useAccount';
import { clockSample, estimateClockOffset, expectedPositionMs, type ClockSample } from '@nebula/room-sync';
import { RoomDevicesPanel } from './RoomDevicesPanel';
import { RoomAcousticQaPanel } from './RoomAcousticQaPanel';
import { RoomRequestsPanel } from './RoomRequestsPanel';
import { RoomQRModal } from './RoomQRModal';
import { ConfirmModal } from './ConfirmModal';
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
  const [queueLoaded, setQueueLoaded] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; confirmLabel: string; run: () => void } | null>(null);

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
    finally { setQueueLoaded(true); }
  }, [selectedId, account.user?.id, account.cloudRequest]);

  // Queue mutations do not bump the room revision, so the queue keeps its own
  // fallback poll. The event stream also reports a queue fingerprint.
  useEffect(() => {
    if (!selectedId || !account.user) return;
    setQueueLoaded(false);
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
      void refreshQueue();
    }, 250);
  }, [refreshSelected, refreshMembers, refreshQueue]);
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
    if (!selected) return;
    const roomId = selected.id;
    setConfirmAction({
      title: 'Expulsar participante',
      message: 'La persona saldrá de la sala. Los enlaces de audio que ya recibió caducan como máximo en cinco minutos.',
      confirmLabel: 'Expulsar',
      run: () => { void action(async () => {
        await account.cloudRequest('/v1/rooms/' + roomId + '/members/' + member.userId, { method: 'DELETE' });
        await refreshMembers(); await refreshSelected();
        setNotice('Participante expulsado.');
      }); },
    });
  }

  function transferHost(member: RoomMember) {
    if (!selected) return;
    const roomId = selected.id;
    setConfirmAction({
      title: 'Transferir la administración',
      message: 'Esta persona pasará a ser anfitriona y tú quedarás como oyente en la sala.',
      confirmLabel: 'Transferir',
      run: () => { void action(async () => {
        await account.cloudRequest('/v1/rooms/' + roomId + '/transfer-host', {
          method: 'POST', body: JSON.stringify({ memberId: member.userId }),
        });
        await refreshSelected(); await refreshMembers();
        setNotice('Anfitrión transferido. Ahora eres participante.');
      }); },
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

  async function shareRoomLink(code: string) {
    const url = buildRoomInviteLink(window.location.href, code);
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
    setConfirmAction({
      title: isHost ? 'Cerrar la sala' : 'Salir de la sala',
      message: isHost ? 'La sala se cerrará para todos los participantes y la cola dejará de estar disponible.'
        : 'Dejarás de escuchar esta sala. Puedes volver con una invitación del anfitrión.',
      confirmLabel: isHost ? 'Cerrar sala' : 'Salir',
      run: () => { void action(async () => {
        await account.cloudRequest('/v1/rooms/' + room.id + (isHost ? '/close' : '/leave'), { method: 'POST', body: '{}' });
        if (selectedId === room.id) { setSelectedId(null); setSelected(null); setIssuedCode(''); }
        setNotice(isHost ? 'Sala cerrada.' : 'Saliste de la sala.');
      }); },
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

  // The server stores only the invite hash, so an existing code cannot be read
  // back. "Invitar" therefore creates a fresh code on demand and says so.
  async function ensureInvite(): Promise<string | null> {
    if (!selected) return null;
    if (issuedCode) return issuedCode;
    setBusy(true); setError('');
    try {
      const result = await account.cloudRequest<{ inviteCode: string }>('/v1/rooms/' + selected.id + '/invite', {
        method: 'POST', body: '{}',
      });
      setIssuedCode(result.inviteCode);
      return result.inviteCode;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo crear el enlace de invitación.');
      return null;
    } finally { setBusy(false); }
  }

  async function copyInviteLink() {
    const code = await ensureInvite();
    if (!code) return;
    try {
      await navigator.clipboard.writeText(buildRoomInviteLink(window.location.href, code));
      setNotice('Enlace de invitación copiado.');
    } catch { setError('No se pudo copiar el enlace. Copia el código manualmente.'); }
  }

  async function copyInviteCode() {
    const code = await ensureInvite();
    if (!code) return;
    try { await navigator.clipboard.writeText(code); setNotice('Código copiado.'); }
    catch { setError('No se pudo copiar el código. Selecciónalo manualmente.'); }
  }

  async function openQr() {
    const code = await ensureInvite();
    if (code) setInviteOpen(true);
  }

  const isHost = Boolean(selected && account.user && selected.ownerUserId === account.user.id);
  const currentTrack = selected?.trackId ? queue.find(item => item.trackId === selected.trackId) : undefined;

  const createJoinCards = (compact: boolean) => <div className={compact ? 'room-grid room-grid-compact' : 'room-grid'}>
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
  </div>;

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
      {error && <div className="room-alert glass" role="alert">
        <AlertCircle size={17} aria-hidden="true"/>
        <span>{error}</span>
        <button type="button" className="room-notice-close" aria-label="Descartar error" onClick={()=>setError('')}><X size={15}/></button>
      </div>}
      {notice && <div className="room-notice" role="status">
        <CheckCircle2 size={17} aria-hidden="true"/>
        <span className="room-notice-text">{notice}</span>
        <button type="button" className="room-notice-close" aria-label="Descartar aviso" onClick={()=>setNotice('')}><X size={15}/></button>
      </div>}
      {selected ? <>
        <nav className="room-switcher" aria-label="Cambiar de sala">
          {rooms.map(room => <button key={room.id} type="button" className={'room-switch' + (selectedId===room.id?' is-active':'')} aria-current={selectedId===room.id?'true':undefined} onClick={()=>{setSelectedId(room.id);setIssuedCode('');}}>
            <span className="status-dot" aria-hidden="true"/>
            <span className="room-switch-name">{room.name}</span>
            <small>{room.ownerUserId===account.user?.id?'Anfitrión':'Invitado'} · {room.participantCount}</small>
          </button>)}
          <button type="button" className="room-switch is-action" aria-expanded={showCreate} onClick={()=>setShowCreate(value=>!value)}>
            <Plus size={15}/> {showCreate?'Ocultar':'Nueva o unirme'}
          </button>
        </nav>
        {showCreate && createJoinCards(true)}

        <div className="room-workspace">
          <div className="room-workspace-main">
            <section className={'room-panel room-now' + (selected.trackId && selected.playbackStatus==='playing' ? ' is-playing':'')} aria-labelledby="room-now-title">
              <div className="room-now-head">
                <div>
                  <p className="eyebrow">SONANDO AHORA</p>
                  <h2 id="room-now-title">{selected.name}</h2>
                  <div className="room-chips">
                    <span className="room-chip is-role">{isHost?<Crown size={13}/>:<Headphones size={13}/>} {isHost?'Anfitrión':'Invitado'}</span>
                    <span className="room-chip">{selected.mode==='party'?'Party Sound (beta)':'Escucha compartida'}</span>
                    <span className="room-chip is-live"><span className="status-dot"/>{selected.trackId && selected.playbackStatus==='playing'?'En vivo':'Sala abierta'}</span>
                    <span className="room-chip"><Users size={13}/> {selected.participantCount} {selected.participantCount===1?'persona':'personas'}</span>
                  </div>
                </div>
                <button type="button" className="button secondary small" disabled={busy} onClick={()=>leaveOrClose(selected)}>{isHost?'Cerrar sala':'Salir'}</button>
              </div>

              <div className="room-now-track">
                <span className="room-now-icon"><Music2 size={22}/></span>
                <div className="room-now-copy">
                  <strong>{currentTrack ? currentTrack.title : selected.trackId ? 'Audio del anfitrión' : 'Sin canción compartida'}</strong>
                  <small>{selected.trackId
                    ? (selected.playbackStatus==='playing' ? 'Reproduciendo para toda la sala' : 'En pausa para toda la sala')
                    : 'El anfitrión elige una canción y activa el audio compartido'}</small>
                  {currentTrack && <small className="room-now-artist">{currentTrack.artist}</small>}
                </div>
              </div>

              {isHost ? <div className="room-actions">
                {selected.trackId ? <>
                  <button type="button" className="button primary" disabled={busy} onClick={()=>changePlayback(selected.playbackStatus==='playing'?'paused':'playing')}>
                    {selected.playbackStatus==='playing'?<><Pause size={16}/> Pausar para todos</>:<><Play size={16}/> Reanudar para todos</>}
                  </button>
                  <button type="button" className="button secondary" disabled={busy || !selected.shareEnabled || !queue.length} onClick={nextFromQueue}><SkipForward size={16}/> Siguiente de la cola</button>
                  {selected.shareEnabled && <button type="button" className="button text-action" disabled={busy} onClick={disableSharing}>Dejar de compartir</button>}
                </> : <button type="button" className="button primary" onClick={()=>document.getElementById('room-share')?.scrollIntoView({behavior:'smooth',block:'center'})}><Plus size={16}/> Compartir una canción</button>}
              </div> : <div className="room-actions">
                <button type="button" className="button secondary" onClick={()=>document.getElementById('room-devices')?.scrollIntoView({behavior:'smooth',block:'start'})}><Headphones size={16}/> Ir a mi salida de audio</button>
              </div>}
            </section>

            {isHost && <section className="room-panel" id="room-share" aria-labelledby="room-share-title">
              <div className="room-panel-head"><h3 id="room-share-title">Compartir música</h3><span className="room-panel-note">Desde tu biblioteca cloud</span></div>
              <label htmlFor="room-cloud-track" className="room-field-label">Canción</label>
              <select id="room-cloud-track" value={selectedCloudId} disabled={loadingCloudItems} onChange={e=>{setSelectedCloudId(e.target.value);setRightsConfirmed(false);}}>
                <option value="">{loadingCloudItems?'Cargando canciones…':'Selecciona una canción'}</option>
                {cloudItems.map(item=><option key={item.id} value={item.id}>{item.title} — {item.artist}</option>)}
              </select>
              {!loadingCloudItems && cloudItems.length===0 && <p className="room-panel-note" role="status">No tienes canciones cloud listas. Sube un MP3 o FLAC permitido a tu nube privada para compartirlo.</p>}
              <label className="room-check">
                <input type="checkbox" checked={rightsConfirmed} onChange={e=>setRightsConfirmed(e.target.checked)}/>
                <span>Confirmo que tengo derechos para compartir este audio con los participantes.</span>
              </label>
              <div className="room-actions">
                <button type="button" className="button primary" disabled={busy || !selectedCloudId || !rightsConfirmed} onClick={startSharedAudio}><Play size={16}/> Compartir y empezar</button>
                <button type="button" className="button secondary" disabled={busy || !selectedCloudId || !rightsConfirmed} onClick={addToQueue}><ListMusic size={16}/> Agregar a la cola</button>
                <button type="button" className="button text-action" onClick={onLibrary}>Ir a Biblioteca</button>
                <button type="button" className="button text-action" disabled={loadingCloudItems} onClick={()=>{void refreshCloudItems();}}>Actualizar lista</button>
              </div>
            </section>}

            <section className="room-panel" aria-labelledby="room-queue-title">
              <div className="room-panel-head">
                <h3 id="room-queue-title">Cola compartida</h3>
                <span className="room-panel-note">{queue.length ? queue.length + (queue.length===1?' canción':' canciones') : 'Vacía'}</span>
              </div>
              {!isHost && <p className="room-panel-note">Solo el anfitrión reordena la cola. Puedes proponer canciones en «DJ colaborativo».</p>}
              {queueLoaded && currentTrack && <div className="room-queue-now">
                <span className="status-dot" aria-hidden="true"/><span className="room-queue-now-label">Ahora</span>
                <strong>{currentTrack.title}</strong><small>{currentTrack.artist}</small>
              </div>}
              {!queueLoaded ? <div className="room-queue-skeleton" aria-hidden="true">{[0,1,2].map(index=><span className="skeleton" key={index}/>)}</div>
                : !queue.length ? <div className="room-queue-empty">
                    <ListMusic size={22} aria-hidden="true"/>
                    <p>La cola está vacía.</p>
                    {isHost && <button type="button" className="button secondary small" onClick={()=>document.getElementById('room-share')?.scrollIntoView({behavior:'smooth',block:'center'})}>Agregar una canción</button>}
                  </div>
                : <ol className="room-queue">{queue.map((item,index)=><li className="room-queue-item" key={item.id}>
                    <span className="room-queue-index">{index+1}</span>
                    <span className="track-descriptor"><strong>{item.title}</strong><small>{item.artist}</small></span>
                    {isHost && <span className="room-queue-actions">
                      <button type="button" className="button small" aria-label={'Subir '+item.title} disabled={busy || queueBusy || index===0} onClick={()=>moveQueueItem(index,-1)}>↑</button>
                      <button type="button" className="button small" aria-label={'Bajar '+item.title} disabled={busy || queueBusy || index===queue.length-1} onClick={()=>moveQueueItem(index,1)}>↓</button>
                      <button type="button" className="icon-button" aria-label={'Quitar '+item.title} disabled={busy} onClick={()=>removeFromQueue(item.id)}><X size={16}/></button>
                    </span>}
                  </li>)}</ol>}
            </section>
          </div>

          <aside className="room-workspace-side">
            {isHost && <section className="room-panel room-invite" aria-labelledby="room-invite-title">
              <div className="room-panel-head"><h3 id="room-invite-title">Invitar</h3><span className="room-panel-note">Acceso privado</span></div>
              {issuedCode ? <>
                <div className="room-invite-code"><code>{issuedCode}</code></div>
                <div className="room-actions">
                  <button type="button" className="button primary small" disabled={busy} onClick={()=>{void copyInviteLink();}}><Link2 size={15}/> Copiar enlace</button>
                  <button type="button" className="button secondary small" onClick={()=>{void shareRoomLink(issuedCode);}}><Share2 size={15}/> Compartir</button>
                  <button type="button" className="button secondary small" disabled={busy} onClick={()=>{void openQr();}}><QrCode size={15}/> QR</button>
                  <button type="button" className="icon-button" aria-label="Copiar código" onClick={()=>{void copyInviteCode();}}><Copy size={16}/></button>
                </div>
                <p className="room-panel-note">El código se muestra solo ahora; guárdalo. Si generas otro, los enlaces anteriores dejan de funcionar.</p>
                <details className="room-diagnostics">
                  <summary>Generar un código nuevo</summary>
                  <p>Invalida las invitaciones que ya compartiste.</p>
                  <button type="button" className="button secondary small" disabled={busy} onClick={rotateCode}>Generar nuevo código</button>
                </details>
              </> : <>
                <p className="room-panel-note">Comparte un enlace privado. Al crearlo se genera un código nuevo y los anteriores dejan de funcionar.</p>
                <button type="button" className="button primary small" disabled={busy} onClick={()=>{void ensureInvite();}}><Link2 size={15}/> Crear enlace de invitación</button>
              </>}
            </section>}

            <section className="room-panel" aria-labelledby="room-members-title">
              <div className="room-panel-head"><h3 id="room-members-title">Participantes</h3><span className="room-panel-note">{members.length} en la sala</span></div>
              <ul className="room-member-list">
                {members.map(member=><li key={member.userId}>
                  <span className="room-member-name"><strong>{member.userId===account.user?.id?'Tú':member.email??'Participante'}</strong><small>{member.role==='host'?'Anfitrión':'Oyente'}</small></span>
                  {isHost && member.userId!==account.user?.id && <span className="room-member-actions">
                    <button type="button" className="button secondary small" disabled={busy} onClick={()=>transferHost(member)}>Hacer anfitrión</button>
                    <button type="button" className="button secondary small" disabled={busy} onClick={()=>removeMember(member)}>Expulsar</button>
                  </span>}
                </li>)}
              </ul>
            </section>

            <section className="room-devices-panel" id="room-devices" aria-label="Escucha aquí">
              <RoomDevicesPanel room={selected} account={account} clockOffsetMs={clockOffsetMs} onActivate={onActivate}/>
            </section>

            <RoomRequestsPanel roomId={selected.id} hostId={selected.ownerUserId} account={account}/>

            <details className="room-diagnostics room-panel">
              <summary>Detalles técnicos</summary>
              <p>El estado se guarda en PostgreSQL y los cambios llegan por un canal de eventos; la API sigue siendo la fuente de verdad.</p>
              <p>Reloj: {clockMetrics ? 'offset estimado ' + Math.round(clockOffsetMs) + ' ms con ' + clockMetrics.samples + ' muestras y RTT de red ' + clockMetrics.rttMs + ' ms' : 'aún midiendo la conexión'}. Estas cifras no miden el retardo acústico; calibra cada salida en «Escucha aquí».</p>
            </details>

            <RoomAcousticQaPanel/>
          </aside>
        </div>
      </> : <>
        {createJoinCards(false)}
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
      </>}

      <ConfirmModal
        isOpen={Boolean(confirmAction)}
        title={confirmAction?.title ?? ''}
        message={confirmAction?.message ?? ''}
        confirmLabel={confirmAction?.confirmLabel}
        onCancel={()=>setConfirmAction(null)}
        onConfirm={()=>{const run=confirmAction?.run; setConfirmAction(null); run?.();}}
      />
      <RoomQRModal isOpen={inviteOpen} onClose={()=>setInviteOpen(false)} roomName={selected?.name ?? 'la sala'} inviteCode={issuedCode}/>
    </>}
  </section>;
}
