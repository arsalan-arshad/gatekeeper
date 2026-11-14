import { DrizzleAdapter } from '@auth/drizzle-adapter';
import {
  authAccounts,
  authSessions,
  authUsers,
  authVerificationTokens,
  createDb,
} from '@gatekeeper/db';
import NextAuth from 'next-auth';
import Resend from 'next-auth/providers/resend';

function getDb() {
  const url =
    process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/gatekeeper';
  return createDb(url);
}

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
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY || 're_missing_for_local_dev',
      from: process.env.EMAIL_FROM || 'Gatekeeper <onboarding@resend.dev>',
      async sendVerificationRequest({ identifier, url, provider }) {
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
            subject: 'Sign in to Gatekeeper',
            html: `<p>Click to sign in to Gatekeeper:</p><p><a href="${url}">${url}</a></p>`,
            text: `Sign in to Gatekeeper: ${url}`,
          }),
        });

        if (!response.ok) {
          throw new Error(`Resend error: ${await response.text()}`);
        }
      },
    }),
  ],
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
