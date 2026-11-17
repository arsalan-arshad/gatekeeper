/**
 * Where /start (and /start/check-email) should send a visitor.
 * Sessioned users never see the magic-link form.
 */
export type StartDestination = 'magic_link' | 'interview' | 'dashboard';

export function resolveStartDestination(input: {
  signedIn: boolean;
  hasPublishedHandle: boolean;
  /** Explicit redo interview — stay on interview even with a published handle. */
  redo?: boolean;
}): StartDestination {
  if (!input.signedIn) return 'magic_link';
  if (input.hasPublishedHandle && !input.redo) return 'dashboard';
  return 'interview';
}
