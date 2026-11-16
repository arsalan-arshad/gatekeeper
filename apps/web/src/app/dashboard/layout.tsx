import type { Metadata } from 'next';

import { auth } from '@/auth';
import { AnalyticsIdentify } from '@/components/analytics-identify';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return (
    <div data-ph-mask>
      <AnalyticsIdentify userId={session?.user?.id} email={session?.user?.email} />
      {children}
    </div>
  );
}
