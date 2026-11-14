import Link from 'next/link';

import { BRAND } from '@/lib/brand';

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* Full-bleed atmospheric plane */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(90% 70% at 70% 40%, rgba(95, 212, 164, 0.16), transparent 55%),
            radial-gradient(60% 50% at 15% 80%, rgba(27, 107, 79, 0.35), transparent 60%),
            linear-gradient(165deg, #07110e 0%, #0b1210 45%, #101a16 100%)
          `,
        }}
      />

      {/* Dominant doorway visual */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-full max-w-none sm:w-[58%]"
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,rgba(0,0,0,0.55)_75%)]" />
        <div className="absolute left-1/2 top-[12%] h-[76%] w-[min(42vw,22rem)] -translate-x-1/2 sm:left-[42%]">
          <div className="door-glow absolute inset-[-8%] rounded-[50%] bg-[radial-gradient(circle,var(--glow),transparent_68%)] blur-2xl" />
          <div className="relative h-full overflow-hidden rounded-t-[999px] border border-[rgba(95,212,164,0.28)] bg-[linear-gradient(180deg,#1a2c24_0%,#0d1713_55%,#080e0b_100%)] shadow-[0_0_80px_rgba(95,212,164,0.12)]">
            <div className="light-sweep absolute inset-y-0 left-0 w-1/3 bg-[linear-gradient(90deg,transparent,rgba(238,243,239,0.14),transparent)]" />
            <div className="absolute inset-x-[18%] top-[22%] bottom-[12%] rounded-t-[999px] border border-[rgba(238,243,239,0.08)] bg-[linear-gradient(180deg,rgba(95,212,164,0.08),transparent_40%)]" />
          </div>
        </div>
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-6 pb-16 pt-8 sm:px-10">
        <nav className="flex items-center justify-between gap-4 text-sm text-[var(--muted)]">
          <span className="tracking-[0.18em] text-[var(--accent)] uppercase">{BRAND.name}</span>
          <div className="flex gap-5">
            <Link href="/ledger" className="hover:text-[var(--fg)]">
              Ledger
            </Link>
            <Link href="/privacy" className="hover:text-[var(--fg)]">
              Privacy
            </Link>
          </div>
        </nav>

        {/* First viewport: brand, headline, one sentence, one CTA group */}
        <section className="flex flex-1 flex-col justify-center py-16 sm:max-w-xl sm:py-24">
          <p
            className="animate-rise text-5xl leading-none tracking-tight text-[var(--fg)] sm:text-7xl md:text-8xl"
            style={{ fontFamily: 'var(--font-display), Georgia, serif' }}
          >
            {BRAND.name}
          </p>
          <h1
            className="animate-rise-delay mt-6 max-w-lg text-2xl leading-snug text-[var(--fg)] sm:text-3xl"
            style={{ fontFamily: 'var(--font-display), Georgia, serif' }}
          >
            {BRAND.tagline}
          </h1>
          <p className="animate-rise-delay-2 mt-5 max-w-md text-base leading-relaxed text-[var(--muted)] sm:text-lg">
            {BRAND.summary}
          </p>
          <div className="animate-rise-delay-2 mt-10 flex flex-wrap items-center gap-4">
            <Link
              href="/start"
              className="rounded-md bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[#062015] transition hover:brightness-110"
            >
              Start your Gatekeeper
            </Link>
            <Link
              href="/ledger"
              className="text-sm text-[var(--muted)] underline decoration-[var(--accent-deep)] underline-offset-4 hover:text-[var(--fg)]"
            >
              See the public ledger
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
