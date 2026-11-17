'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, useTransition } from 'react';

import { captureEvent } from '@/lib/analytics/client';

export type DirectoryEntry = {
  handle: string;
  name: string;
  role: string | null;
  tags: string[];
  bio: string | null;
  wantsSummary: string | null;
  offersSummary: string | null;
  profileUrl: string;
};

function resultsBucket(count: number): '0' | '1-5' | '6-20' | '20+' {
  if (count <= 0) return '0';
  if (count <= 5) return '1-5';
  if (count <= 20) return '6-20';
  return '20+';
}

export function ExploreClient({
  initialResults,
  initialCursor,
  apiBase,
}: {
  initialResults: DirectoryEntry[];
  initialCursor: string | null;
  apiBase: string;
}) {
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [tag, setTag] = useState('');
  const [results, setResults] = useState(initialResults);
  const [cursor, setCursor] = useState(initialCursor);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const search = useCallback(
    (opts: { append?: boolean; nextCursor?: string | null } = {}) => {
      startTransition(async () => {
        setError(null);
        const params = new URLSearchParams();
        if (q.trim()) params.set('q', q.trim());
        if (role.trim()) params.set('role', role.trim());
        if (tag.trim()) params.set('tag', tag.trim().toLowerCase());
        if (opts.append && opts.nextCursor) params.set('cursor', opts.nextCursor);
        try {
          const res = await fetch(`${apiBase}/v1/directory?${params.toString()}`, {
            cache: 'no-store',
          });
          if (!res.ok) {
            setError(
              res.status === 429 ? 'Too many searches — try again shortly.' : 'Search failed',
            );
            return;
          }
          const body = (await res.json()) as {
            results: DirectoryEntry[];
            nextCursor: string | null;
          };
          setResults((prev) => (opts.append ? [...prev, ...body.results] : body.results));
          setCursor(body.nextCursor);
          if (!opts.append) {
            captureEvent('explore_search', {
              has_query: Boolean(q.trim()),
              role_filter: Boolean(role.trim()),
              tag_count: tag.trim() ? 1 : 0,
              results_bucket: resultsBucket(body.results.length),
            });
          }
        } catch {
          setError('Search temporarily unavailable');
        }
      });
    },
    [apiBase, q, role, tag],
  );

  useEffect(() => {
    // Initial page load analytics without query text.
    captureEvent('explore_search', {
      has_query: false,
      role_filter: false,
      tag_count: 0,
      results_bucket: resultsBucket(initialResults.length),
    });
  }, [initialResults.length]);

  return (
    <div className="flex flex-col gap-8">
      <form
        className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-sm">
          Search
          <input
            className="rounded-md border border-white/15 bg-black/30 px-3 py-2"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={100}
            placeholder="Name, bio, wants…"
          />
        </label>
        <label className="flex min-w-[10rem] flex-col gap-1 text-sm">
          Role
          <input
            className="rounded-md border border-white/15 bg-black/30 px-3 py-2"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            maxLength={80}
            placeholder="Founder"
          />
        </label>
        <label className="flex min-w-[10rem] flex-col gap-1 text-sm">
          Tag
          <input
            className="rounded-md border border-white/15 bg-black/30 px-3 py-2"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            maxLength={32}
            placeholder="saas"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[#062015] disabled:opacity-50"
        >
          {pending ? 'Searching…' : 'Search'}
        </button>
      </form>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      {results.length === 0 ? (
        <p className="text-[var(--muted)]">
          No opted-in profiles match yet. Publish your Gatekeeper and list yourself in Settings to
          appear here.
        </p>
      ) : (
        <ul className="flex flex-col gap-6">
          {results.map((entry) => (
            <li key={entry.handle} className="border-b border-white/10 pb-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2
                  className="text-2xl"
                  style={{ fontFamily: 'var(--font-display), Georgia, serif' }}
                >
                  <Link
                    href={`${entry.profileUrl}?ref=explore`}
                    className="hover:text-[var(--accent)]"
                  >
                    {entry.name}
                  </Link>
                </h2>
                {entry.role ? <p className="text-sm text-[var(--muted)]">{entry.role}</p> : null}
              </div>
              {entry.tags.length > 0 ? (
                <p className="mt-2 text-xs tracking-wide text-[var(--muted)] uppercase">
                  {entry.tags.join(' · ')}
                </p>
              ) : null}
              {entry.bio ? <p className="mt-3 text-sm text-[var(--fg)]">{entry.bio}</p> : null}
              {entry.wantsSummary ? (
                <p className="mt-2 text-sm text-[var(--muted)]">
                  <span className="text-[var(--fg)]">Wants:</span> {entry.wantsSummary}
                </p>
              ) : null}
              {entry.offersSummary ? (
                <p className="mt-1 text-sm text-[var(--muted)]">
                  <span className="text-[var(--fg)]">Offers:</span> {entry.offersSummary}
                </p>
              ) : null}
              <Link
                href={`${entry.profileUrl}?ref=explore`}
                className="mt-4 inline-block text-sm text-[var(--accent)] hover:brightness-110"
              >
                Request an intro →
              </Link>
            </li>
          ))}
        </ul>
      )}

      {cursor ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => search({ append: true, nextCursor: cursor })}
          className="w-fit rounded-md border border-white/15 px-4 py-2 text-sm disabled:opacity-50"
        >
          Load more
        </button>
      ) : null}
    </div>
  );
}
