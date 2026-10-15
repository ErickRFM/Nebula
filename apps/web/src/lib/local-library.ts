import type { Track } from './catalog';

const DATABASE = 'nebula-personal-library';
const STORE = 'songs';
const VERSION = 1;
export const MAX_AUDIO_BYTES = 100 * 1024 * 1024; // Per-file safeguard, not a storage quota guarantee.

export interface SavedSong {
  id: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  cover: string;
  duration: string;
  mimeType: string;
  blob: Blob;
  createdAt: number;
}

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB unavailable'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Cannot open local music library'));
    request.onblocked = () => reject(new Error('Music library upgrade blocked by another tab'));
  });
}

function transaction<T>(operation: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason: unknown) => void) => void, mode: IDBTransactionMode): Promise<T> {
  return openDb().then((database) => new Promise<T>((resolve, reject) => {
    const tx = database.transaction(STORE, mode);
    let settled = false;
    let result: T;
    tx.oncomplete = () => { database.close(); if (!settled) resolve(result); };
    tx.onabort = () => { database.close(); reject(tx.error ?? new Error('Storage transaction aborted')); };
    tx.onerror = () => { /* onabort reports an error, avoiding duplicate rejection */ };
    operation(tx.objectStore(STORE), (value) => { result = value; settled = false; }, (reason) => { settled = true; tx.abort(); reject(reason); });
  }));
}

export function loadSavedSongs(): Promise<SavedSong[]> {
  return transaction((store, resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result as SavedSong[]);
    request.onerror = () => reject(request.error);
  }, 'readonly');
}

export function saveSong(song: SavedSong): Promise<void> {
  return transaction((store, resolve, reject) => {
    const request = store.put(song);
    request.onsuccess = () => resolve(undefined);
    request.onerror = () => reject(request.error);
  }, 'readwrite');
}

export function deleteSavedSong(id: string): Promise<void> {
  return transaction((store, resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve(undefined);
    request.onerror = () => reject(request.error);
  }, 'readwrite');
}

export function songToTrack(song: SavedSong, audioUrl: string): Track {
  return { id: song.id, title: song.title, artist: song.artist, album: song.album, genre: song.genre, duration: song.duration, cover: song.cover, audioUrl };
}
