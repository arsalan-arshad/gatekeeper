'use client';

import posthog from 'posthog-js';

import { sanitizeAnalyticsPath, sanitizeAnalyticsProps } from './sanitize';

export type AnalyticsEvent =
  | 'demo_started'
  | 'demo_submitted'
  | 'signup_started'
  | 'magic_link_sent'
  | 'signup_completed'
  | 'interview_completed'
  | 'rules_drafted'
  | 'handle_link_copied'
  | 'owner_approved'
  | 'owner_rejected'
  | 'api_key_created'
  | 'upgrade_clicked'
  | 'rules_saved'
  | 'rules_tested'
  | 'notification_settings_saved'
  | 'data_exported'
  | 'intro_request_submitted'
  | 'cta_clicked'
  | 'directory_opt_in'
  | 'explore_search'
  | '$pageview';

let initialized = false;
let optedOut = false;

function posthogKey(): string {
  return (process.env.NEXT_PUBLIC_POSTHOG_KEY ?? '').trim();
}

function posthogHost(): string {
  const host = (process.env.NEXT_PUBLIC_POSTHOG_HOST ?? '/ingest').trim();
  return host || '/ingest';
}

function uiHostFromProxyOrigins(): string {
  const explicit = (process.env.NEXT_PUBLIC_POSTHOG_UI_HOST ?? '').trim();
  if (explicit) return explicit;
  const proxy = (process.env.POSTHOG_PROXY_INGEST_ORIGIN ?? '').trim().toLowerCase();
  if (proxy.includes('eu.i.posthog.com')) return 'https://eu.posthog.com';
  return 'https://us.posthog.com';
}

function dntEnabled(): boolean {
  if (typeof navigator === 'undefined') return false;
  const dnt = navigator.doNotTrack ?? (navigator as { msDoNotTrack?: string }).msDoNotTrack;
  return dnt === '1' || dnt === 'yes';
}

/** True when analytics may capture (key present, not DNT). */
export function isAnalyticsEnabled(): boolean {
  return Boolean(posthogKey()) && !dntEnabled() && !optedOut;
}

function applyDashboardMasking(pathname: string): void {
  if (!initialized || !posthogKey() || optedOut) return;
  const onDashboard = pathname.startsWith('/dashboard');
  try {
    posthog.set_config({
      session_recording: {
        maskAllInputs: true,
        // Full-page text mask on dashboard/inbox; elsewhere only `[data-ph-mask]` trees.
        maskTextSelector: onDashboard ? '*' : '[data-ph-mask], [data-ph-mask] *',
      },
    });
  } catch {
    /* ignore */
  }
}

/**
 * Init PostHog once on the client. No-op without key or when DNT is set.
 * Safe to call repeatedly.
 */
export function initAnalytics(): void {
  if (typeof window === 'undefined') return;
  if (initialized) return;

  const key = posthogKey();
  if (!key) {
    initialized = true;
    return;
  }

  if (dntEnabled()) {
    optedOut = true;
    initialized = true;
    return;
  }

  const onDashboard = window.location.pathname.startsWith('/dashboard');

  posthog.init(key, {
    api_host: posthogHost(),
    ui_host: uiHostFromProxyOrigins(),
    person_profiles: 'identified_only',
    capture_pageview: false,
    capture_pageleave: true,
    persistence: 'localStorage+cookie',
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: onDashboard ? '*' : '[data-ph-mask], [data-ph-mask] *',
    },
    loaded: (ph) => {
      if (dntEnabled()) {
        ph.opt_out_capturing();
        optedOut = true;
      }
    },
  });

  initialized = true;
}

export function captureEvent(
  event: AnalyticsEvent | string,
  properties?: Record<string, unknown>,
): void {
  if (typeof window === 'undefined') return;
  if (!posthogKey() || dntEnabled() || optedOut) return;
  if (!initialized) initAnalytics();
  if (!isAnalyticsEnabled()) return;

  const clean = sanitizeAnalyticsProps(properties);
  posthog.capture(event, clean);
}

export function capturePageview(pathWithSearch: string): void {
  const path = sanitizeAnalyticsPath(pathWithSearch);
  const pathname = path.split('?')[0] ?? path;
  applyDashboardMasking(pathname);
  captureEvent('$pageview', { $current_url: path });
}

/**
 * Identify only with Gatekeeper users.id (UUID). Never pass email.
 */
export function identifyUser(userId: string): void {
  if (typeof window === 'undefined') return;
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) return;
  if (!posthogKey() || dntEnabled() || optedOut) return;
  if (!initialized) initAnalytics();
  if (!isAnalyticsEnabled()) return;
  posthog.identify(userId);
}

export function resetAnalytics(): void {
  if (typeof window === 'undefined') return;
  if (!initialized || !posthogKey()) return;
  try {
    posthog.reset();
  } catch {
    /* ignore */
  }
}

/** Test helper — reset module flags between unit tests. */
export function __resetAnalyticsStateForTests(): void {
  initialized = false;
  optedOut = false;
}
