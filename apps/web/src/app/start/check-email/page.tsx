import Link from 'next/link';

export default function CheckEmailPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-3xl" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
        Check your email
      </h1>
      <p className="text-[var(--muted)]">
        We sent a magic link. In local dev without <code>RESEND_API_KEY</code>, the link is printed
        in the web server console.
      </p>
      <Link className="text-[var(--accent)] underline" href="/start">
        Back to start
      </Link>
    </main>
  );
}
