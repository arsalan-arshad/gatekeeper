import { emailSuppressions, users } from '@gatekeeper/db';
import { and, desc, eq, ilike, lt, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import { getDb } from './db.js';

/** Demo / seed handles never appear in the public directory. */
export const DIRECTORY_EXCLUDED_HANDLES = ['demo', 'ada', 'jonas', 'mira'] as const;

export const DIRECTORY_TAG_PATTERN = /^[a-z0-9][a-z0-9+#.-]{0,31}$/;
export const DIRECTORY_MAX_TAGS = 10;
export const DIRECTORY_ROLE_MAX = 80;
export const DIRECTORY_Q_MAX = 100;
export const DIRECTORY_WANT_MAX = 100;
export const DIRECTORY_DEFAULT_LIMIT = 20;
export const DIRECTORY_MAX_LIMIT = 50;

const DEMO_EMAIL_SUFFIX = '@demo.gatekeeper.local';

export type DirectoryUserRow = {
  id: string;
  handle: string;
  name: string;
  email: string;
  bio: string | null;
  wantsText: string | null;
  offersText: string | null;
  neverText: string | null;
  directoryOptIn: boolean;
  directoryOptInAt?: Date | null;
  directoryRole: string | null;
  directoryTags: string[];
  directoryPromptDismissedAt?: Date | null;
  updatedAt: Date;
  profileEmbedding?: number[] | null;
  plan?: string;
  lemonCustomerId?: string | null;
  lemonSubscriptionId?: string | null;
  notificationEmailMode?: string;
  minRelevance?: number;
  ruleText?: string;
};

export type DirectoryPublicEntry = {
  handle: string;
  name: string;
  role: string | null;
  tags: string[];
  bio: string | null;
  wantsSummary: string | null;
  offersSummary: string | null;
  profileUrl: string;
};

const PUBLIC_KEYS = [
  'handle',
  'name',
  'role',
  'tags',
  'bio',
  'wantsSummary',
  'offersSummary',
  'profileUrl',
] as const;

export function truncateText(value: string | null | undefined, max: number): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

/** Escape `%`, `_`, and `\` for safe parameterized ILIKE patterns. */
export function escapeIlikePattern(raw: string): string {
  return raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export function encodeDirectoryCursor(updatedAt: Date, id: string): string {
  return Buffer.from(`${updatedAt.toISOString()}|${id}`, 'utf8').toString('base64url');
}

export function decodeDirectoryCursor(cursor: string): { updatedAt: Date; id: string } | null {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const sep = raw.indexOf('|');
    if (sep <= 0) return null;
    const iso = raw.slice(0, sep);
    const id = raw.slice(sep + 1);
    const updatedAt = new Date(iso);
    if (!id || Number.isNaN(updatedAt.getTime())) return null;
    return { updatedAt, id };
  } catch {
    return null;
  }
}

export function normalizeDirectoryTags(tags: string[] | undefined | null): string[] {
  if (!tags?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().toLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

export function validateDirectoryTags(
  tags: string[] | undefined | null,
): { ok: true; tags: string[] } | { ok: false; error: string } {
  const normalized = normalizeDirectoryTags(tags);
  if (normalized.length > DIRECTORY_MAX_TAGS) {
    return { ok: false, error: `At most ${DIRECTORY_MAX_TAGS} tags` };
  }
  for (const tag of normalized) {
    if (!DIRECTORY_TAG_PATTERN.test(tag)) {
      return { ok: false, error: `Invalid tag: ${tag}` };
    }
  }
  return { ok: true, tags: normalized };
}

export const directoryUpdateSchema = z.object({
  optIn: z.boolean(),
  role: z.string().max(DIRECTORY_ROLE_MAX).nullable().optional(),
  tags: z.array(z.string().max(32)).max(DIRECTORY_MAX_TAGS).optional(),
  dismissPrompt: z.boolean().optional(),
});

export const directoryQuerySchema = z.object({
  q: z.string().max(DIRECTORY_Q_MAX).optional(),
  role: z.string().max(DIRECTORY_ROLE_MAX).optional(),
  tag: z.union([z.string(), z.array(z.string())]).optional(),
  want: z.string().max(DIRECTORY_WANT_MAX).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(DIRECTORY_MAX_LIMIT).optional(),
});

export function parseDirectoryTagsQuery(
  tag: string | string[] | undefined,
): { ok: true; tags: string[] } | { ok: false; error: string } {
  if (tag == null) return { ok: true, tags: [] };
  const list = (Array.isArray(tag) ? tag : [tag])
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (list.length > 5) return { ok: false, error: 'At most 5 tag filters' };
  for (const t of list) {
    if (!DIRECTORY_TAG_PATTERN.test(t)) return { ok: false, error: `Invalid tag filter: ${t}` };
  }
  return { ok: true, tags: [...new Set(list)] };
}

/**
 * Whitelist serializer — never leak id/email/never_text/rules/embeddings/plan.
 * Unit-tested with a row that includes every private column.
 */
export function toDirectoryPublicEntry(row: DirectoryUserRow): DirectoryPublicEntry {
  return {
    handle: row.handle,
    name: row.name,
    role: truncateText(row.directoryRole, DIRECTORY_ROLE_MAX),
    tags: Array.isArray(row.directoryTags) ? row.directoryTags : [],
    bio: truncateText(row.bio, 280),
    wantsSummary: truncateText(row.wantsText, 200),
    offersSummary: truncateText(row.offersText, 200),
    profileUrl: `/@${row.handle}`,
  };
}

export function directoryPublicKeys(entry: DirectoryPublicEntry): string[] {
  return Object.keys(entry).sort();
}

export function expectedDirectoryPublicKeys(): string[] {
  return [...PUBLIC_KEYS].sort();
}

export function isDirectoryExcludedHandle(handle: string): boolean {
  return (DIRECTORY_EXCLUDED_HANDLES as readonly string[]).includes(handle.toLowerCase());
}

export function isDirectoryExcludedEmail(email: string): boolean {
  return email.toLowerCase().endsWith(DEMO_EMAIL_SUFFIX);
}

export function isVisibleInDirectory(
  row: Pick<DirectoryUserRow, 'directoryOptIn' | 'handle' | 'email'>,
  suppressedEmails: Set<string> = new Set(),
): boolean {
  if (!row.directoryOptIn) return false;
  if (isDirectoryExcludedHandle(row.handle)) return false;
  if (isDirectoryExcludedEmail(row.email)) return false;
  if (suppressedEmails.has(row.email.toLowerCase())) return false;
  return true;
}

function rowMatchesQuery(
  row: DirectoryUserRow,
  filters: { q?: string; role?: string; tags: string[]; want?: string },
): boolean {
  if (filters.role) {
    const role = (row.directoryRole ?? '').toLowerCase();
    if (!role.includes(filters.role.toLowerCase())) return false;
  }
  if (filters.want) {
    const wants = (row.wantsText ?? '').toLowerCase();
    if (!wants.includes(filters.want.toLowerCase())) return false;
  }
  if (filters.tags.length > 0) {
    const have = new Set(row.directoryTags.map((t) => t.toLowerCase()));
    if (!filters.tags.every((t) => have.has(t))) return false;
  }
  if (filters.q) {
    const q = filters.q.toLowerCase();
    const hay = [
      row.name,
      row.bio ?? '',
      row.wantsText ?? '',
      row.offersText ?? '',
      row.directoryRole ?? '',
      row.directoryTags.join(' '),
    ]
      .join(' ')
      .toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

/** Memory-mode directory for unit tests (no Postgres). */
let memoryDirectory: DirectoryUserRow[] | null = null;
let memorySuppressed = new Set<string>();

export function useMemoryDirectoryForTests(enabled = true): void {
  memoryDirectory = enabled ? [] : null;
  memorySuppressed = new Set();
}

export function isMemoryDirectoryEnabledForTests(): boolean {
  return memoryDirectory !== null;
}

export function resetMemoryDirectoryForTests(): void {
  if (memoryDirectory) memoryDirectory = [];
  memorySuppressed = new Set();
}

export function seedMemoryDirectoryUserForTests(row: DirectoryUserRow): void {
  if (!memoryDirectory) throw new Error('Memory directory not enabled');
  memoryDirectory = memoryDirectory.filter((u) => u.id !== row.id && u.handle !== row.handle);
  memoryDirectory.push({
    ...row,
    directoryTags: [...row.directoryTags],
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt),
  });
}

export function seedMemorySuppressedEmailForTests(email: string): void {
  memorySuppressed.add(email.toLowerCase());
}

export function updateMemoryDirectoryUserForTests(
  id: string,
  patch: Partial<DirectoryUserRow>,
): DirectoryUserRow | null {
  if (!memoryDirectory) return null;
  const idx = memoryDirectory.findIndex((u) => u.id === id);
  if (idx < 0) return null;
  const next = { ...memoryDirectory[idx]!, ...patch };
  memoryDirectory[idx] = next;
  return next;
}

export function findMemoryDirectoryByEmailForTests(email: string): DirectoryUserRow | null {
  if (!memoryDirectory) return null;
  return memoryDirectory.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
}

export type DirectoryListResult = {
  results: DirectoryPublicEntry[];
  nextCursor: string | null;
};

export async function listDirectory(input: {
  q?: string;
  role?: string;
  tags?: string[];
  want?: string;
  cursor?: string;
  limit?: number;
}): Promise<DirectoryListResult> {
  const limit = Math.min(Math.max(1, input.limit ?? DIRECTORY_DEFAULT_LIMIT), DIRECTORY_MAX_LIMIT);
  const tags = input.tags ?? [];
  const cursor = input.cursor ? decodeDirectoryCursor(input.cursor) : null;
  if (input.cursor && !cursor) {
    return { results: [], nextCursor: null };
  }

  if (memoryDirectory) {
    const filtered = memoryDirectory
      .filter((row) => isVisibleInDirectory(row, memorySuppressed))
      .filter((row) =>
        rowMatchesQuery(row, {
          q: input.q,
          role: input.role,
          tags,
          want: input.want,
        }),
      )
      .sort((a, b) => {
        const t = b.updatedAt.getTime() - a.updatedAt.getTime();
        if (t !== 0) return t;
        return b.id.localeCompare(a.id);
      });

    let start = 0;
    if (cursor) {
      start = filtered.findIndex(
        (row) =>
          row.updatedAt.getTime() < cursor.updatedAt.getTime() ||
          (row.updatedAt.getTime() === cursor.updatedAt.getTime() && row.id < cursor.id),
      );
      if (start < 0) start = filtered.length;
    }

    const page = filtered.slice(start, start + limit + 1);
    const hasMore = page.length > limit;
    const slice = hasMore ? page.slice(0, limit) : page;
    const last = slice[slice.length - 1];
    return {
      results: slice.map(toDirectoryPublicEntry),
      nextCursor: hasMore && last ? encodeDirectoryCursor(last.updatedAt, last.id) : null,
    };
  }

  const db = getDb();
  const conditions: SQL[] = [
    eq(users.directoryOptIn, true),
    sql`lower(${users.handle}) NOT IN (${sql.join(
      DIRECTORY_EXCLUDED_HANDLES.map((h) => sql`${h}`),
      sql`, `,
    )})`,
    sql`lower(${users.email}) NOT LIKE ${`%${DEMO_EMAIL_SUFFIX}`}`,
    sql`NOT EXISTS (
      SELECT 1 FROM ${emailSuppressions}
      WHERE lower(${emailSuppressions.email}) = lower(${users.email})
    )`,
  ];

  if (input.role?.trim()) {
    conditions.push(ilike(users.directoryRole, `%${escapeIlikePattern(input.role.trim())}%`));
  }
  if (input.want?.trim()) {
    conditions.push(ilike(users.wantsText, `%${escapeIlikePattern(input.want.trim())}%`));
  }
  if (tags.length > 0) {
    conditions.push(sql`${users.directoryTags} @> ${tags}::text[]`);
  }
  if (input.q?.trim()) {
    const pattern = `%${escapeIlikePattern(input.q.trim())}%`;
    conditions.push(
      or(
        ilike(users.name, pattern),
        ilike(users.bio, pattern),
        ilike(users.wantsText, pattern),
        ilike(users.offersText, pattern),
        ilike(users.directoryRole, pattern),
        sql`EXISTS (
          SELECT 1 FROM unnest(${users.directoryTags}) AS t(tag)
          WHERE t.tag ILIKE ${pattern}
        )`,
      )!,
    );
  }
  if (cursor) {
    conditions.push(
      or(
        lt(users.updatedAt, cursor.updatedAt),
        and(eq(users.updatedAt, cursor.updatedAt), sql`${users.id} < ${cursor.id}`),
      )!,
    );
  }

  const rows = await db
    .select({
      id: users.id,
      handle: users.handle,
      name: users.name,
      email: users.email,
      bio: users.bio,
      wantsText: users.wantsText,
      offersText: users.offersText,
      neverText: users.neverText,
      directoryOptIn: users.directoryOptIn,
      directoryRole: users.directoryRole,
      directoryTags: users.directoryTags,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(and(...conditions))
    .orderBy(desc(users.updatedAt), desc(users.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const last = slice[slice.length - 1];
  return {
    results: slice.map((row) =>
      toDirectoryPublicEntry({
        ...row,
        directoryTags: row.directoryTags ?? [],
      }),
    ),
    nextCursor: hasMore && last ? encodeDirectoryCursor(last.updatedAt, last.id) : null,
  };
}
