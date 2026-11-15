import Link from 'next/link';

import { BRAND } from '@/lib/brand';

const EXAMPLE_RULES = [
  {
    title: 'Indie SaaS founder',
    body: 'Accept peer founders and early customers with a concrete use case. Reject vague coffee chats. Spam crypto and agency blasts.',
  },
  {
    title: 'Hiring lead',
    body: 'Accept named candidate referrals and peer hiring-lead intros. Reject agencies without a named person.',
  },
  {
    title: 'Researcher',
    body: 'Accept research collabs with a clear artifact. Reject fundraising decks and AI-wrapper pitches.',
  },
];

const FAQ = [
  {
    q: 'Do senders see my private rules?',
    a: 'No. Gatekeeper judges privately and only returns a public reason plus an optional suggested rewrite.',
  },
  {
    q: 'What is an AI principal?',
    a: 'Agents are untrusted. A principal has its own reputation, can say no, and only brokers intros both sides accept.',
  },
  {
    q: 'Can AI agents request intros?',
    a: 'Yes. Agents POST to /v1/requests with an API key. Start with /llms.txt and /openapi.json.',
  },
  {
    q: 'Is Gatekeeper free / open source?',
    a: 'Yes — AGPL-3.0. Receivers start free. The public ledger is the reputation surface.',
  },
];

export function LandingSections() {
  return (
    <>
      <section id="how-it-works" className="scroll-mt-20 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-6 sm:px-10">
          <h2
            className="text-3xl text-[var(--fg)] sm:text-4xl"
            style={{ fontFamily: 'var(--font-display), Georgia, serif' }}
          >
            How it works
          </h2>
          <p className="mt-3 max-w-2xl text-[var(--muted)]">
            Three steps from inbound ask to a double-opt-in intro — spam never reaches your inbox.
          </p>

          <ol className="mt-10 grid gap-8 sm:grid-cols-3">
            {[
              {
                n: '01',
                t: 'Anyone requests',
                d: 'Humans and agents send a note to your public Gatekeeper link.',
              },
              {
                n: '02',
                t: 'Your rules judge',
                d: 'Gatekeeper scores fit, blocks spam, and explains publicly without leaking private rules.',
              },
              {
                n: '03',
                t: 'You both opt in',
                d: 'Only accepted requests become intros — after both sides say yes.',
              },
            ].map((step) => (
              <li key={step.n}>
                <p className="text-sm tracking-[0.2em] text-[var(--accent)]">{step.n}</p>
                <h3
                  className="mt-2 text-xl text-[var(--fg)]"
                  style={{ fontFamily: 'var(--font-display), Georgia, serif' }}
                >
                  {step.t}
                </h3>
                <p className="mt-2 leading-relaxed text-[var(--muted)]">{step.d}</p>
              </li>
            ))}
          </ol>

          <div className="mt-14 grid gap-6 lg:grid-cols-2">
            <MockThread
              title="Accepted"
              tone="accept"
              lines={[
                { who: 'Sender', text: 'Peer founder — usage-based billing SaaS, clear ask.' },
                {
                  who: 'Gatekeeper',
                  text: 'Score 88 · accept. Forwarding for double opt-in.',
                },
                { who: 'You', text: 'Accept → intro email lands for both of you.' },
              ]}
            />
            <MockThread
              title="Rejected"
              tone="reject"
              lines={[
                { who: 'Sender', text: 'Hot crypto NFT — promote our token!!' },
                {
                  who: 'Gatekeeper',
                  text: 'Score 8 · spam. Public reason + suggested rewrite only.',
                },
                { who: 'You', text: 'Nothing in your inbox. Ledger notes spam blocked.' },
              ]}
            />
          </div>
        </div>
      </section>

      <section id="example-rules" className="border-t border-white/10 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-6 sm:px-10">
          <h2
            className="text-3xl text-[var(--fg)] sm:text-4xl"
            style={{ fontFamily: 'var(--font-display), Georgia, serif' }}
          >
            Example rules
          </h2>
          <p className="mt-3 max-w-2xl text-[var(--muted)]">
            Plain English. Editable after a five-question interview. Never shown to senders.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {EXAMPLE_RULES.map((rule) => (
              <article
                key={rule.title}
                className="rounded-xl border border-white/10 bg-black/20 p-5"
              >
                <h3
                  className="text-lg text-[var(--fg)]"
                  style={{ fontFamily: 'var(--font-display), Georgia, serif' }}
                >
                  {rule.title}
                </h3>
                <p className="mt-3 leading-relaxed text-[var(--muted)]">{rule.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="for-agents" className="border-t border-white/10 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-6 sm:px-10">
          <h2
            className="text-3xl text-[var(--fg)] sm:text-4xl"
            style={{ fontFamily: 'var(--font-display), Georgia, serif' }}
          >
            For AI agents
          </h2>
          <p className="mt-3 max-w-2xl text-[var(--muted)]">
            Agents are untrusted. Authenticate, be specific, and expect a judgment — not a guaranteed
            intro.
          </p>
          <pre className="mt-8 overflow-x-auto rounded-xl border border-white/10 bg-black/35 p-5 text-sm leading-relaxed text-[var(--fg)]">
            <code>{`POST /v1/requests
Authorization: Bearer gk_your_key
Content-Type: application/json

{
  "targetHandle": "demo",
  "senderName": "ResearchBot",
  "senderContact": "ops@example.com",
  "message": "Concrete ask with context…",
  "senderType": "agent"
}`}</code>
          </pre>
          <p className="mt-4 text-[var(--muted)]">
            Machine-readable instructions:{' '}
            <Link href="/llms.txt" className="text-[var(--accent)] underline underline-offset-4">
              /llms.txt
            </Link>{' '}
            ·{' '}
            <Link
              href="/openapi.json"
              className="text-[var(--accent)] underline underline-offset-4"
            >
              /openapi.json
            </Link>
          </p>
        </div>
      </section>

      <section id="open-source" className="border-t border-white/10 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-6 sm:px-10">
          <h2
            className="text-3xl text-[var(--fg)] sm:text-4xl"
            style={{ fontFamily: 'var(--font-display), Georgia, serif' }}
          >
            Open source
          </h2>
          <p className="mt-3 max-w-2xl text-[var(--muted)]">
            Gatekeeper is AGPL-3.0. Inspect the judge, run your own instance, contribute rules and
            tests.
          </p>
          <a
            href={BRAND.githubUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-8 inline-flex rounded-md border border-[var(--accent)]/40 px-5 py-2.5 text-sm font-semibold text-[var(--accent)] transition hover:bg-[var(--accent)]/10"
          >
            View on GitHub
          </a>
        </div>
      </section>

      <section id="faq" className="border-t border-white/10 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-6 sm:px-10">
          <h2
            className="text-3xl text-[var(--fg)] sm:text-4xl"
            style={{ fontFamily: 'var(--font-display), Georgia, serif' }}
          >
            FAQ
          </h2>
          <dl className="mt-10 grid gap-8 sm:grid-cols-2">
            {FAQ.map((item) => (
              <div key={item.q}>
                <dt
                  className="text-lg text-[var(--fg)]"
                  style={{ fontFamily: 'var(--font-display), Georgia, serif' }}
                >
                  {item.q}
                </dt>
                <dd className="mt-2 leading-relaxed text-[var(--muted)]">{item.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </>
  );
}

function MockThread({
  title,
  tone,
  lines,
}: {
  title: string;
  tone: 'accept' | 'reject';
  lines: Array<{ who: string; text: string }>;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm tracking-wide text-[var(--muted)] uppercase">Chat / phone mockup</p>
        <span
          className={`rounded-md px-2 py-1 text-xs font-semibold uppercase ${
            tone === 'accept' ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'bg-red-500/20 text-red-200'
          }`}
        >
          {title}
        </span>
      </div>
      <div className="mx-auto max-w-sm rounded-[1.75rem] border border-white/15 bg-[#07110e] p-3 shadow-inner">
        <div className="mb-3 flex justify-center">
          <span className="h-1.5 w-16 rounded-full bg-white/15" />
        </div>
        <ul className="space-y-3 px-1 pb-2">
          {lines.map((line) => (
            <li
              key={line.who + line.text}
              className={`rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                line.who === 'Gatekeeper'
                  ? 'bg-[var(--accent)]/15 text-[var(--fg)]'
                  : 'bg-white/5 text-[var(--muted)]'
              }`}
            >
              <span className="text-xs tracking-wide text-[var(--accent)] uppercase">{line.who}</span>
              <p className="mt-1">{line.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
