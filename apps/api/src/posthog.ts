import { PostHog } from 'posthog-node';

import { sanitizeServerAnalyticsProps } from './posthog-sanitize.js';

let client: PostHog | null = null;
let disabled = false;

function posthogKey(): string {
  return (process.env.POSTHOG_KEY ?? '').trim();
}

function posthogHost(): string {
  return (process.env.POSTHOG_HOST ?? 'https://us.i.posthog.com').replace(/\/$/, '');
}

function getClient(): PostHog | null {
  if (disabled) return null;
  const key = posthogKey();
  if (!key) {
    disabled = true;
    return null;
  }
  if (!client) {
    client = new PostHog(key, {
      host: posthogHost(),
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return client;
}

/** Optional server-side capture. No-op without POSTHOG_KEY. Never send PII. */
export function captureServerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>,
): void {
  const ph = getClient();
  if (!ph) return;
  const id = distinctId.trim();
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return;
  try {
    ph.capture({
      distinctId: id,
      event,
      properties: sanitizeServerAnalyticsProps(properties),
    });
  } catch {
    /* never break request path for analytics */
  }
}

export async function shutdownPosthog(): Promise<void> {
  if (client) {
    await client.shutdown();
    client = null;
  }
}
