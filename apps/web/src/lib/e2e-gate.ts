import { timingSafeEqual } from 'node:crypto';

/**
 * E2E login is staging/CI only — never production.
 * Requires NODE_ENV !== 'production' AND E2E_ENABLED=1 AND E2E_SECRET set.
 */
export function isE2eLoginEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.NODE_ENV !== 'production' && env.E2E_ENABLED === '1' && Boolean(env.E2E_SECRET?.trim());
}

/** Constant-time compare for E2E secrets (rejects length mismatch without leaking via strcmp). */
export function e2eSecretsEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
