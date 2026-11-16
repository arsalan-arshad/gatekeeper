'use client';

import { useEffect } from 'react';

import { identifyUser } from '@/lib/analytics/client';

/** Identify with Gatekeeper users.id (UUID) only — never email. */
export function AnalyticsIdentify({ userId }: { userId: string | null | undefined }) {
  useEffect(() => {
    if (userId) identifyUser(userId);
  }, [userId]);
  return null;
}
