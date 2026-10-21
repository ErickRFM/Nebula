import type { Track } from '../lib/catalog';
export function Cover({ source, alt, className = '' }: {source: string; alt: string; className?: string}) {
  // Public/local art and short-lived owner-authorized R2 image URLs share this renderer.
  return <img src={source} alt={alt} className={className} loading="lazy" referrerPolicy="no-referrer" />;
}
export function TrackCover({ track, className = '' }: {track: Track; className?: string}) {
  return <Cover source={track.cover} alt={'Portada de ' + track.album} className={className}/>;
}
