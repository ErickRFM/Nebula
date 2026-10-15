'use client';
import { useEffect, useState } from 'react';

export type LocalPlaylist = { id: string; title: string; trackIds: string[]; createdAt: number };
const STORAGE_KEY = 'nebula:playlists:v1';

function isPlaylist(value: unknown): value is LocalPlaylist {
  if (!value || typeof value !== 'object') return false;
  const p = value as Partial<LocalPlaylist>;
  return typeof p.id === 'string' && typeof p.title === 'string' && Array.isArray(p.trackIds) && p.trackIds.every((id) => typeof id === 'string') && typeof p.createdAt === 'number';
}

export function parsePlaylists(raw: string | null): LocalPlaylist[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter(isPlaylist).slice(0, 200) : [];
  } catch { return []; }
}

export function usePlaylists() {
  const [playlists, setPlaylists] = useState<LocalPlaylist[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try { setPlaylists(parsePlaylists(localStorage.getItem(STORAGE_KEY))); } catch { /* blocked storage */ }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(playlists)); } catch { /* storage restricted */ }
  }, [playlists, ready]);

  return {
    playlists,
    create: (title: string) => {
      const clean = title.trim().slice(0, 80);
      if (!clean) return null;
      const id = crypto.randomUUID();
      setPlaylists((all) => [{id, title:clean, trackIds:[], createdAt:Date.now()}, ...all]);
      return id;
    },
    rename: (id: string, title: string) => {
      const clean = title.trim().slice(0,80);
      if (clean) setPlaylists((all) => all.map((p) => p.id === id ? {...p,title:clean} : p));
    },
    remove: (id: string) => setPlaylists((all) => all.filter((p) => p.id !== id)),
    addSong: (playlistId: string, trackId: string) =>
      setPlaylists((all) => all.map((p) => p.id === playlistId && !p.trackIds.includes(trackId) ? {...p,trackIds:[...p.trackIds,trackId]} : p)),
    removeSong: (playlistId: string, trackId: string) =>
      setPlaylists((all) => all.map((p) => p.id === playlistId ? {...p,trackIds:p.trackIds.filter((id)=>id!==trackId)} : p)),
    removeFromAll: (trackId: string) =>
      setPlaylists((all) => all.map((p) => ({...p,trackIds:p.trackIds.filter((id)=>id!==trackId)}))),
  };
}
