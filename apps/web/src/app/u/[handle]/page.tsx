import type { Metadata } from 'next';
import Link from 'next/link';

import { NotFoundView } from '@/components/not-found-view';
import { SiteFooter } from '@/components/site-footer';
import { SiteNav } from '@/components/site-nav';
import { API_URL } from '@/lib/api';
import { BRAND } from '@/lib/brand';
import { DEMO_USER_FALLBACK } from '@/lib/demo';
import { handleNotFoundMetadata } from '@/lib/handle-not-found-meta';

import { DemoIntroForm } from './demo-intro-form';
import { IntroRequestForm } from './intro-form';

type PublicUser = {
  handle: string;
  name: string;
  bio: string | null;
  wantsText: string | null;
  offersText: string | null;
};

async function getPublicUser(
  handle: string,
): Promise<{ user: PublicUser; demoFallback: boolean } | null> {
  const normalized = handle.toLowerCase();
  try {
    const response = await fetch(`${API_URL}/v1/users/${encodeURIComponent(normalized)}`, {
      cache: 'no-store',
    });
    if (response.ok) {
      const body = (await response.json()) as { user: PublicUser };
      return { user: body.user, demoFallback: false };
    }
    if (normalized === 'demo') {
      // Seeded @demo may be missing when DB is down — keep the public demo page up.
      return { user: DEMO_USER_FALLBACK, demoFallback: true };
    }
    if (response.status === 404) return null;
  } catch {
    if (normalized === 'demo') {
      return { user: DEMO_USER_FALLBACK, demoFallback: true };
    }
  }
  return null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const data = await getPublicUser(handle);
  if (!data) {
    // Soft fallback when middleware could not confirm missing (API down).
    // Hard 404 for known-missing handles is served by middleware from
    // `/handle-not-found` (exactly one noindex,nofollow meta + header).
    return handleNotFoundMetadata;
  }
  const { user } = data;
  const title = `${user.name} (@${user.handle}) · Gatekeeper`;
  const description =
    user.bio?.trim() ||
    `Request an intro with ${user.name} through Gatekeeper — AI principal with a public ledger.`;
  const url = `${BRAND.siteUrl}/@${user.handle}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: 'profile',
      images: [{ url: '/og.png', width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/og.png'],
    },
  };
}

export default async function PublicHandlePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const data = await getPublicUser(handle);
  // Avoid notFound() — Next would inject meta content="noindex" only (or
  // duplicate if we also set nofollow). Middleware already hard-404s known
  // missing handles; this is the soft fallback path.
  if (!data) return <NotFoundView />;

  const { user, demoFallback } = data;
  const isDemo = user.handle === 'demo' || demoFallback;
  const profileUrl = `${BRAND.siteUrl}/@${user.handle}`;
  const profileJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    mainEntity: {
      '@type': 'Person',
      name: user.name,
      url: profileUrl,
      ...(user.bio ? { description: user.bio } : {}),
    },
    url: profileUrl,
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(profileJsonLd) }}
      />
      <SiteNav compact />

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-[var(--muted)]">@{user.handle}</p>
          {isDemo ? (
            <span className="rounded-md border border-[var(--accent)]/35 bg-[var(--accent)]/10 px-2.5 py-1 text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
              Demo data
            </span>
          ) : null}
        </div>
        <h1 className="text-4xl" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
          {user.name}
        </h1>
        {user.bio ? <p className="text-lg text-[var(--muted)]">{user.bio}</p> : null}
        {user.wantsText ? (
          <p className="text-sm text-[var(--muted)]">
            <span className="text-[var(--accent)]">Open to:</span> {user.wantsText}
          </p>
        ) : null}
        {user.offersText ? (
          <p className="text-sm text-[var(--muted)]">
            <span className="text-[var(--accent)]">Offers:</span> {user.offersText}
          </p>
        ) : null}
        <Link className="text-sm text-[var(--accent)] underline" href={`/@${user.handle}/ledger`}>
          View public ledger
        </Link>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
          Request an intro
        </h2>
        <p className="text-sm text-[var(--muted)]">
          Your note goes to {user.name}&apos;s Gatekeeper first. Private rules stay private.
          {isDemo
            ? ' Demo judgments use the same rate-limited AI judge as the landing page — no email delivery.'
            : null}
        </p>
        {isDemo ? (
          <DemoIntroForm handle={user.handle} />
        ) : (
          <IntroRequestForm handle={user.handle} />
        )}
      </section>

      <p className="text-sm text-[var(--muted)]">
        <Link href="/" className="text-[var(--accent)] underline underline-offset-4">
          Powered by Gatekeeper
        </Link>
      </p>
      <SiteFooter />
    </main>
  );
}
