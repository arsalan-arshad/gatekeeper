import { SiteFooter } from '@/components/site-footer';
import { SiteNav } from '@/components/site-nav';
import { API_URL } from '@/lib/api';
import { publicPageMetadata } from '@/lib/seo';

import { ExploreClient, type DirectoryEntry } from './explore-client';

type SearchParams = Promise<{
  q?: string;
  role?: string;
  tag?: string | string[];
  want?: string;
  cursor?: string;
}>;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const hasQuery = Boolean(params.q || params.role || params.tag || params.want || params.cursor);
  return publicPageMetadata({
    title: 'Explore · Gatekeeper',
    description:
      'Browse people who opted into the Gatekeeper directory. Every intro still goes through their rules.',
    path: '/explore',
    ...(hasQuery ? { robots: { index: false, follow: true } } : {}),
  });
}

async function loadDirectory(searchParams: {
  q?: string;
  role?: string;
  tag?: string | string[];
  want?: string;
  cursor?: string;
}): Promise<{ results: DirectoryEntry[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  if (searchParams.q) params.set('q', searchParams.q);
  if (searchParams.role) params.set('role', searchParams.role);
  if (searchParams.want) params.set('want', searchParams.want);
  if (searchParams.cursor) params.set('cursor', searchParams.cursor);
  const tags = searchParams.tag
    ? Array.isArray(searchParams.tag)
      ? searchParams.tag
      : [searchParams.tag]
    : [];
  for (const t of tags) params.append('tag', t);

  try {
    const res = await fetch(`${API_URL}/v1/directory?${params.toString()}`, {
      next: { revalidate: 10 },
    });
    if (!res.ok) return { results: [], nextCursor: null };
    const body = (await res.json()) as {
      results?: DirectoryEntry[];
      nextCursor?: string | null;
    };
    return {
      results: Array.isArray(body.results) ? body.results : [],
      nextCursor: body.nextCursor ?? null,
    };
  } catch {
    return { results: [], nextCursor: null };
  }
}

export default async function ExplorePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { results, nextCursor } = await loadDirectory(params);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-10 px-6 py-12">
      <SiteNav />
      <div>
        <h1 className="text-4xl" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
          Explore
        </h1>
        <p className="mt-3 text-[var(--muted)]">
          People who chose to be listed. Request an intro on their page — Gatekeeper still judges
          every ask.
        </p>
      </div>
      <ExploreClient initialResults={results} initialCursor={nextCursor} apiBase={API_URL} />
      <SiteFooter />
    </main>
  );
}
