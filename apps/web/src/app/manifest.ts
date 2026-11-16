import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Gatekeeper',
    short_name: 'Gatekeeper',
    description:
      'Gatekeeper is an AI principal with its own reputation. It reads every request against your rules, says no to spam, and only makes intros you both accept.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0b1210',
    theme_color: '#0b1210',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  };
}
