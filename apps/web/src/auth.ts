import { DrizzleAdapter } from '@auth/drizzle-adapter';
import {
  authAccounts,
  authSessions,
  authUsers,
  authVerificationTokens,
  createDb,
} from '@gatekeeper/db';
import { headers } from 'next/headers';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Resend from 'next-auth/providers/resend';

import { e2eSecretsEqual, isE2eLoginEnabled } from '@/lib/e2e-gate';
import { allowMagicLinkSend } from '@/lib/magic-rate-limit';

function getDb() {
  const url =
    process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/gatekeeper';
  return createDb(url);
}

/** Branded magic-link HTML (duplicated lightly so web does not import API package). */
function buildMagicLinkEmail(url: string): { subject: string; html: string; text: string } {
  const appUrl = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const settingsUrl = `${appUrl}/dashboard/settings`;
  const studioUrl = 'https://arsalandev.studio?utm_source=gatekeeper&utm_medium=email';
  const subject = 'Sign in to Gatekeeper';
  const text = [
    'Sign in to Gatekeeper with this magic link:',
    url,
    '',
    'If you did not request this, you can ignore this email.',
    '',
    '—',
    'Gatekeeper by Arsalan · arsalandev.studio',
    `Email settings / unsubscribe: ${settingsUrl}`,
  ].join('\n');
  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#07110e;color:#f4f1ea;font-family:Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;"><tr><td align="center">
  <table width="100%" style="max-width:560px;background:#0b1612;border:1px solid #1f322a;border-radius:12px;padding:28px 24px;">
  <tr><td>
  <p style="letter-spacing:0.18em;text-transform:uppercase;color:#5fd4a4;font-size:12px;font-weight:600;">Gatekeeper</p>
  <h1 style="font-size:22px;color:#f4f1ea;">Sign in to Gatekeeper</h1>
  <p style="color:#c9d6cf;line-height:1.55;">Use the button below to sign in. The link expires soon.</p>
  <p><a href="${url}" style="display:inline-block;padding:12px 20px;border-radius:6px;background:#5fd4a4;color:#062015;font-weight:600;text-decoration:none;">Sign in</a></p>
  <p style="font-size:13px;color:#8fa399;word-break:break-all;">Or paste this URL:<br/><a href="${url}" style="color:#5fd4a4;">${url}</a></p>
  <hr style="border:none;border-top:1px solid #1f322a;margin:28px 0 16px;" />
  <p style="font-size:12px;color:#8fa399;line-height:1.5;">Gatekeeper by Arsalan · <a href="${studioUrl}" style="color:#5fd4a4;text-decoration:none;">arsalandev.studio</a><br/>
  <a href="${settingsUrl}" style="color:#8fa399;">Email settings / unsubscribe</a></p>
  </td></tr></table></td></tr></table></body></html>`;
  return { subject, html, text };
}

const resendProvider = Resend({
  apiKey: process.env.RESEND_API_KEY || 're_missing_for_local_dev',
  from: process.env.EMAIL_FROM || 'Gatekeeper <onboarding@resend.dev>',
  async sendVerificationRequest({ identifier, url, provider }) {
    // Prefer platform Real-IP; do not trust raw client X-Forwarded-For.
    const hdrs = await headers();
    const ip = hdrs.get('x-real-ip')?.trim() || 'unknown';
    const allowed = await allowMagicLinkSend(identifier, ip).catch(() => true);
    if (!allowed) {
      throw new Error('Too many sign-in emails. Try again later.');
    }

    const content = buildMagicLinkEmail(url);
    if (!process.env.RESEND_API_KEY) {
      console.info(`\n[gatekeeper] Magic link for ${identifier}:\n${url}\n`);
      return;
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: provider.from,
        to: identifier,
        subject: content.subject,
        html: content.html,
        text: content.text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Resend error: ${await response.text()}`);
    }
  },
});

// Playwright / CI / staging only — never when NODE_ENV=production.
const e2eProvider = isE2eLoginEnabled()
  ? Credentials({
      id: 'e2e',
      name: 'E2E',
      credentials: {
        email: { label: 'Email', type: 'email' },
        secret: { label: 'Secret', type: 'text' },
      },
      async authorize(credentials) {
        if (!isE2eLoginEnabled()) return null;
        const email = String(credentials?.email ?? '')
          .trim()
          .toLowerCase();
        const secret = String(credentials?.secret ?? '');
        const expected = process.env.E2E_SECRET!.trim();
        if (!email || !e2eSecretsEqual(secret, expected)) {
          return null;
        }
        return { id: `e2e:${email}`, email, name: email.split('@')[0] ?? 'e2e' };
      },
    })
  : null;

const providers = e2eProvider ? [resendProvider, e2eProvider] : [resendProvider];

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(getDb(), {
    usersTable: authUsers,
    accountsTable: authAccounts,
    sessionsTable: authSessions,
    verificationTokensTable: authVerificationTokens,
  }),
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/start',
    verifyRequest: '/start/check-email',
  },
  providers,
  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        session.user.email = (token.email as string | undefined) ?? session.user.email;
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        token.email = user.email;
      }
      return token;
    },
  },
  trustHost: true,
});
