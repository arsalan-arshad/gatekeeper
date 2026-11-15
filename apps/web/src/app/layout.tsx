import type { Metadata } from 'next';
import { IBM_Plex_Sans, Syne } from 'next/font/google';

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

export const metadata: Metadata = {
  title: 'Gatekeeper — Let anyone reach you. Only the right ones get through.',
  description:
    'Gatekeeper is an AI principal with its own reputation. It reads every request against your rules, says no to spam, and only makes intros you both accept.',
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
    title: 'Gatekeeper — Let anyone reach you. Only the right ones get through.',
    description:
      'Gatekeeper is an AI principal with its own reputation. It reads every request against your rules, says no to spam, and only makes intros you both accept.',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'Gatekeeper — Let anyone reach you. Only the right ones get through.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Gatekeeper — Let anyone reach you. Only the right ones get through.',
    description:
      'Gatekeeper is an AI principal with its own reputation. It reads every request against your rules, says no to spam, and only makes intros you both accept.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
