'use client';

import { useEffect } from 'react';

import { identifyUser } from '@/lib/analytics/client';

/** Identifies once when the authenticated session reaches the browser, including page refreshes. */
export function AnalyticsIdentify({
  userId,
  email,
}: {
  userId: string | null | undefined;
  email?: string | null;
}) {
  useEffect(() => {
    if (userId) identifyUser(userId, email);
  }, [email, userId]);
  return null;
}
