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
    </main>
  );
}
