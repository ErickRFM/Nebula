import type { NextConfig } from 'next';

// The browser shell stays exportable for Capacitor. Server APIs live in apps/api later.
const nextConfig: NextConfig = {
  output: 'export',
  reactStrictMode: true,
  transpilePackages: ['@nebula/player-core'],
  images: { unoptimized: true },
};
export default nextConfig;
