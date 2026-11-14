import Link from 'next/link';

import { BRAND } from '@/lib/brand';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-sm uppercase tracking-[0.2em] text-[var(--accent)]">{BRAND.name}</p>
      <h1
        className="text-4xl leading-tight sm:text-5xl"
        style={{ fontFamily: 'var(--font-display), Georgia, serif' }}
      >
        {BRAND.tagline}
      </h1>
      <p className="max-w-xl text-lg text-[var(--muted)]">{BRAND.summary}</p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/start"
          className="w-fit rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-black"
        >
          Start your Gatekeeper
        </Link>
        <Link
          href="/dashboard/keys"
          className="w-fit rounded-md border border-white/20 px-4 py-2 font-medium text-[var(--fg)]"
        >
          API keys
        </Link>
        <Link
          href="/ledger"
          className="w-fit rounded-md border border-white/20 px-4 py-2 font-medium text-[var(--fg)]"
        >
          Public ledger
        </Link>
      </div>
    </main>
  );
}
