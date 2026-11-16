import type { Metadata } from 'next';

import { BRAND } from '@/lib/brand';

/** Absolute public URL for a path (no trailing slash except `/`). */
export function absoluteUrl(path = '/'): string {
  const base = BRAND.siteUrl.replace(/\/$/, '');
  if (!path || path === '/') return `${base}/`;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized.replace(/\/$/, '')}`;
}

type PublicMetaInput = {
  title: string;
  description: string;
  /** Path beginning with `/`, or `/` for home. */
  path: string;
  robots?: Metadata['robots'];
};

/** Page-level metadata with matching OG/Twitter and absolute canonical. */
export function publicPageMetadata({
  title,
  description,
  path,
  robots,
}: PublicMetaInput): Metadata {
  const url = absoluteUrl(path);
  return {
    title,
    description,
    ...(robots ? { robots } : {}),
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: BRAND.name,
      images: [
        {
          url: '/og.png',
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/og.png'],
    },
  };
}
