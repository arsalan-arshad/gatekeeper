import type { Metadata } from 'next';

import { IBM_Plex_Sans, Syne } from 'next/font/google';

import { AnalyticsProvider } from '@/components/analytics-provider';
import { BRAND } from '@/lib/brand';
import { publicPageMetadata } from '@/lib/seo';

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

const homeTitle = 'Gatekeeper — Only the right ones get through';
const homeMeta = publicPageMetadata({
  title: homeTitle,
  description: BRAND.summary,
  path: '/',
});

export const metadata: Metadata = {
  metadataBase: new URL(BRAND.siteUrl),
  ...homeMeta,
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
