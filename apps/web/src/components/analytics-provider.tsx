'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef } from 'react';

import { capturePageview, initAnalytics } from '@/lib/analytics/client';

function AnalyticsPageviews() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    const search = searchParams?.toString();
    const path = search ? `${pathname}?${search}` : pathname;
    if (lastPath.current === path) return;
    lastPath.current = path;
    capturePageview(path);
  }, [pathname, searchParams]);

  return null;
}

/** Client-only PostHog bootstrap + App Router $pageview. No-op without key / with DNT. */
export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <AnalyticsPageviews />
      </Suspense>
      {children}
    </>
  );
}
