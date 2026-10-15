import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NÉBULA Music · Tu música, tu universo',
  description: 'Explora el concepto Cosmic Glass de NÉBULA y escucha tus propios archivos de audio.',
  applicationName: 'NÉBULA Music',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0b0e1b' };
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
  return <html lang="es"><body>{children}</body></html>;
}
