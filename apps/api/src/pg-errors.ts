/**
 * Detect Postgres unique_violation (SQLSTATE 23505) on the users.handle column.
 * Used so concurrent handle claims return 409 instead of 500.
 */
export function isHandleUniqueViolation(error: unknown): boolean {
  return findUniqueViolation(error, (info) => {
    const haystack = [info.constraint, info.detail, info.message, info.column]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return (
      haystack.includes('users_handle_unique') ||
      haystack.includes('key (handle)') ||
      /(^|[^a-z])handle([^a-z]|$)/.test(haystack)
    );
  });
}

type UniqueInfo = {
  code?: string;
  constraint?: string;
  detail?: string;
  message?: string;
  column?: string;
};

function findUniqueViolation(
  error: unknown,
  predicate: (info: UniqueInfo) => boolean,
  depth = 0,
): boolean {
  if (!error || typeof error !== 'object' || depth > 4) return false;
  const e = error as Record<string, unknown>;
  const code = typeof e.code === 'string' ? e.code : undefined;
  if (code === '23505') {
    const info: UniqueInfo = {
      code,
      constraint: stringField(e, 'constraint_name') ?? stringField(e, 'constraint'),
      detail: stringField(e, 'detail'),
      message: stringField(e, 'message'),
      column: stringField(e, 'column_name') ?? stringField(e, 'column'),
    };
    if (predicate(info)) return true;
  }
  if ('cause' in e) return findUniqueViolation(e.cause, predicate, depth + 1);
  return false;
}

function stringField(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  return typeof value === 'string' ? value : undefined;
}

/** Machine-readable body for taken / raced handle claims. */
export const HANDLE_TAKEN_ERROR = 'handle_taken' as const;

/** Map a handle unique violation to the same 409 body as the non-race taken check. */
export function replyForHandleClaimError(
  error: unknown,
): { status: 409; body: { error: typeof HANDLE_TAKEN_ERROR } } | null {
  if (!isHandleUniqueViolation(error)) return null;
  return { status: 409, body: { error: HANDLE_TAKEN_ERROR } };
}

/** Detect unique violation on intro_matches_pair_live (one live match per unordered pair). */
export function isIntroMatchPairUniqueViolation(error: unknown): boolean {
  return findUniqueViolation(error, (info) => {
    const haystack = [info.constraint, info.detail, info.message]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return (
      haystack.includes('intro_matches_pair_live') ||
      (haystack.includes('intro_matches') &&
        (haystack.includes('requester') ||
          haystack.includes('recipient') ||
          haystack.includes('pair')))
    );
  });
}
