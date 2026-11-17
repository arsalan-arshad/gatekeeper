import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { DashboardNav } from '@/components/dashboard-nav';
import { SiteFooter } from '@/components/site-footer';

import { loadSettings } from './actions';
import { SettingsClient } from './settings-client';

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.email) redirect('/start');

  const result = await loadSettings();
  if ('error' in result && result.error) {
    if (result.error === 'Sign in required') redirect('/start');
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-red-300">{result.error}</p>
      </main>
    );
  }

  const data = result.data!;
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-12">
      <DashboardNav handle={data.handle} active="/dashboard/settings" />
      <div>
        <h1 className="text-4xl" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
          Settings
        </h1>
        <p className="mt-3 text-[var(--muted)]">
          Email notifications, data export, and account deletion.
        </p>
      </div>
      <SettingsClient
        initialMode={data.notificationEmailMode}
        email={data.email}
        handle={data.handle}
        initialIntroContactEmail={data.introContactEmail}
        initialIntroContactVerified={data.introContactVerified}
        initialIntroContactNeedsVerification={data.introContactNeedsVerification}
        initialDirectoryOptIn={data.directoryOptIn}
        initialDirectoryRole={data.directoryRole}
        initialDirectoryTags={data.directoryTags}
      />
      <SiteFooter />
    </main>
  );
}
