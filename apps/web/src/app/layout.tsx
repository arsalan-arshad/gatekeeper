import type { Metadata } from 'next';
import { IBM_Plex_Sans, Syne } from 'next/font/google';

import { BRAND } from '@/lib/brand';

import './globals.css';

const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
});

const display = Syne({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-display',
});

const ogTitle = 'Gatekeeper · by arsalandev.studio';

export const metadata: Metadata = {
  title: 'Gatekeeper — Let anyone reach you. Only the right ones get through.',
  description: BRAND.summary,
  authors: [{ name: 'Arsalan', url: BRAND.creator.studioUrl }],
  creator: 'Arsalan',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  openGraph: {
    title: ogTitle,
    description: BRAND.summary,
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: ogTitle,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: ogTitle,
    description: BRAND.summary,
    images: ['/og.png'],
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      name: 'Gatekeeper',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      license: 'https://www.gnu.org/licenses/agpl-3.0.html',
      description: BRAND.summary,
      url: 'https://arsalandev.studio',
      creator: {
        '@type': 'Person',
        name: 'Arsalan',
        url: BRAND.creator.studioUrl,
      },
    },
    {
      '@type': 'Person',
      name: 'Arsalan',
      url: BRAND.creator.studioUrl,
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body className="min-h-screen antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
