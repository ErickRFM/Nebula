export type Track = {
  id: string; title: string; artist: string; album: string; genre: string;
  cover: string; duration: string; audioUrl?: string;
};
export const artwork = ['/art/orbita.svg','/art/frecuencia.svg','/art/neon.svg','/art/aurora.svg','/art/nocturno.svg','/art/estelar.svg'];
export const demoTracks: Track[] = [
  { id: 'demo-1', title: 'Sin gravedad', artist: 'Luma Nox', album: 'Órbita interior', genre: 'Electrónica', cover: artwork[0], duration: '3:42' },
  { id: 'demo-2', title: 'Frecuencia azul', artist: 'Velora', album: 'Marea digital', genre: 'Chill', cover: artwork[1], duration: '4:05' },
  { id: 'demo-3', title: 'Ecos de neón', artist: 'Atlas Zero', album: 'Futura', genre: 'Pop', cover: artwork[2], duration: '3:26' },
  { id: 'demo-4', title: 'Luz polar', artist: 'Kai Nova', album: 'Aurora', genre: 'Ambient', cover: artwork[3], duration: '4:19' },
  { id: 'demo-5', title: 'Satélites', artist: 'Mira Wave', album: 'Nocturno', genre: 'Indie', cover: artwork[4], duration: '2:59' },
  { id: 'demo-6', title: 'Pulso estelar', artist: 'Nova Duo', album: 'Estelar', genre: 'Electrónica', cover: artwork[5], duration: '3:51' },
];
export const mixes = [
  { title: 'En mi órbita', subtitle: 'Para viajar en tu propio universo', cover: artwork[0] },
  { title: 'Noches de neón', subtitle: 'Luz, energía y nuevas frecuencias', cover: artwork[2] },
  { title: 'Marea tranquila', subtitle: 'Encuentra tu ritmo', cover: artwork[1] },
  { title: 'Aurora suave', subtitle: 'Un momento para desconectar', cover: artwork[3] },
];
