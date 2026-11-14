import Link from 'next/link';

import { BRAND } from '@/lib/brand';

export const metadata = {
  title: 'Privacy — Gatekeeper',
  description: 'How Gatekeeper handles privacy for receivers and senders.',
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-16">
      <Link href="/" className="text-sm uppercase tracking-[0.2em] text-[var(--accent)]">
        {BRAND.name}
      </Link>
      <h1 className="mt-8 text-4xl" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
        Privacy
      </h1>
      <div className="mt-8 space-y-6 text-[var(--muted)] leading-relaxed">
        <p>
          Gatekeeper is designed privacy-first. Your private gate rules are used only to judge
          inbound requests and are never shown to senders, agents, or on your public profile.
        </p>
        <p>
          Public pages may show your handle, name, bio, and ledger aggregates (request volume,
          accept rate, spam blocked, trust score). Intro message content is shared only after you
          Accept a double-opt-in intro.
        </p>
        <p>
          We store account email for magic-link sign-in, request metadata for judging and the
          ledger, and optional billing identifiers when payments are enabled. Abuse signals (rate
          limits, spam decisions, oversized payloads) may be logged to protect the service.
        </p>
        <p>
          LLM providers process request text and embeddings to run Gatekeeper. Do not put secrets
          into public messages. Contact the operator of your deployment to request deletion of your
          account data.
        </p>
        <p className="text-sm">
          This page describes product intent for the open-source project; operators should publish
          their own deployment-specific policy where required.
        </p>
      </div>
    </main>
  );
}
