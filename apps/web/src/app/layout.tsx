import type { Metadata } from 'next';

import { IBM_Plex_Sans, Syne } from 'next/font/google';

import { AnalyticsProvider } from '@/components/analytics-provider';
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

/**
 * Root layout keeps only site-wide chrome metadata.
 * Homepage title/description/canonical/OG live on `app/page.tsx` so `not-found`
 * does not inherit the homepage canonical or social tags.
 */
export const metadata: Metadata = {
  metadataBase: new URL(BRAND.siteUrl),
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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body className="min-h-screen antialiased">
        <AnalyticsProvider>{children}</AnalyticsProvider>
      </body>
    </html>
  );
}
