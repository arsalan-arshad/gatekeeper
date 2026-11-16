import type { Metadata } from 'next';

import { auth } from '@/auth';
import { AnalyticsIdentify } from '@/components/analytics-identify';
import { apiFetch } from '@/lib/api';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let userId: string | null = null;
  const session = await auth();
  const email = session?.user?.email;
  if (email) {
    try {
      const me = await apiFetch<{
        onboarded: boolean;
        user: { id: string } | null;
      }>('/v1/onboarding/me', { email });
      userId = me.user?.id ?? null;
    } catch {
      userId = null;
    }
  }

  return (
    <div data-ph-mask>
      <AnalyticsIdentify userId={userId} />
      {children}
    </div>
  );
}
