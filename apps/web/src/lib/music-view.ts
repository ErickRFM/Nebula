import type { Track } from './catalog';

/** Presentation-only album groups built from genuinely playable, imported tracks. */
export type AlbumGroup = {
  id: string;
  title: string;
  artist: string;
  cover: string;
  tracks: Track[];
};

export function groupPlayableAlbums(tracks: Track[]): AlbumGroup[] {
  const groups = new Map<string, AlbumGroup>();
  for (const track of tracks) {
    if (!track.audioUrl || !track.id.startsWith('local-')) continue;
    const title = track.album.trim() || 'Sin álbum';
    const artist = track.artist.trim() || 'Artista desconocido';
    const key = artist.toLocaleLowerCase('es') + '\u0000' + title.toLocaleLowerCase('es');
    let group = groups.get(key);
    if (!group) {
      group = { id: key, title, artist, cover: track.cover, tracks: [] };
      groups.set(key, group);
    }
    group.tracks.push(track);
  }
  return [...groups.values()].sort((a, b) => b.tracks.length - a.tracks.length || a.title.localeCompare(b.title, 'es'));
}

/** Keep sample tracks out of personal library counts and real playback surfaces. */
export const playableOwnedTracks = (tracks: Track[]): Track[] =>
  tracks.filter(track => track.id.startsWith('local-') && Boolean(track.audioUrl));
