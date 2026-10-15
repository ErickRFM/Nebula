import type { Track } from '../lib/catalog';
export function Cover({ source, alt, className = '' }: {source: string; alt: string; className?: string}) {
  // All artwork is authored locally, never fetched from unrelated third-party sites.
  return <img src={source} alt={alt} className={className} loading="lazy" />;
}
export function TrackCover({ track, className = '' }: {track: Track; className?: string}) {
  return <Cover source={track.cover} alt={'Portada de ' + track.album} className={className}/>;
}
