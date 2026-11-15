import Link from 'next/link';

import { HeroDemo } from '@/components/hero-demo';
import { LandingSections } from '@/components/landing-sections';
import { SiteFooter } from '@/components/site-footer';
import { SiteNav } from '@/components/site-nav';
import { BRAND } from '@/lib/brand';

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-x-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(90% 70% at 78% 18%, rgba(95, 212, 164, 0.14), transparent 55%),
            radial-gradient(60% 50% at 12% 88%, rgba(27, 107, 79, 0.32), transparent 60%),
            linear-gradient(165deg, #07110e 0%, #0b1210 45%, #101a16 100%)
          `,
        }}
      />

      <div className="relative z-10">
        <div className="mx-auto max-w-6xl px-6 pt-8 sm:px-10">
          <SiteNav />
        </div>

        {/* Hero: brand, headline, subhead, CTA, interactive demo */}
        <section className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-6 pb-16 pt-14 sm:px-10 sm:pb-24 sm:pt-20 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] md:items-center">
          <div className="max-w-xl">
            <p
              className="animate-rise text-5xl leading-none tracking-tight text-[var(--fg)] sm:text-6xl md:text-7xl"
              style={{ fontFamily: 'var(--font-display), Georgia, serif' }}
            >
              {BRAND.name}
            </p>
            <h1
              className="animate-rise-delay mt-6 text-2xl leading-snug text-[var(--fg)] sm:text-3xl"
              style={{ fontFamily: 'var(--font-display), Georgia, serif' }}
            >
              {BRAND.tagline}
            </h1>
            <p className="animate-rise-delay-2 mt-5 text-[1.0625rem] leading-relaxed text-[var(--muted)] sm:text-lg">
              {BRAND.summary}
            </p>
            <div className="animate-rise-delay-2 mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/start"
                className="rounded-md bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[#062015] transition hover:brightness-110"
              >
                Start free
              </Link>
              <a
                href="#try"
                className="text-sm text-[var(--muted)] underline decoration-[var(--accent-deep)] underline-offset-4 hover:text-[var(--fg)]"
              >
                Try the demo
              </a>
            </div>
          </div>

          <div id="try" className="animate-rise-delay scroll-mt-24">
            <HeroDemo />
          </div>
        </section>

        <LandingSections />
        <SiteFooter />
      </div>
    </main>
  );
}
