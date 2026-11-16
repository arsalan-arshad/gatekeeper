'use client';

import { useEffect, useRef } from 'react';

import { captureEvent } from '@/lib/analytics/client';

/** Fires once when the check-email page loads after a successful magic-link request. */
export function CheckEmailAnalytics() {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    captureEvent('magic_link_sent');
  }, []);
  return null;
}
