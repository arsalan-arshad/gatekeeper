import { createDb, rateLimitBuckets } from '@gatekeeper/db';
import { eq } from 'drizzle-orm';

const MAGIC_EMAIL_LIMIT = 3;
const MAGIC_EMAIL_WINDOW_MS = 60 * 60 * 1000;
const MAGIC_IP_LIMIT = 10;
const MAGIC_IP_WINDOW_MS = 60 * 60 * 1000;

function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  return createDb(url);
}

async function consume(key: string, limit: number, windowMs: number): Promise<boolean> {
  const db = getDb();
  const nowMs = Date.now();
  const windowStart = new Date(nowMs);
  const [existing] = await db
    .select()
    .from(rateLimitBuckets)
    .where(eq(rateLimitBuckets.bucketKey, key))
    .limit(1);

  if (!existing || nowMs - existing.windowStart.getTime() >= windowMs) {
    await db
      .insert(rateLimitBuckets)
      .values({ bucketKey: key, windowStart, count: 1, updatedAt: windowStart })
      .onConflictDoUpdate({
        target: rateLimitBuckets.bucketKey,
        set: { windowStart, count: 1, updatedAt: windowStart },
      });
    return true;
  }
  if (existing.count >= limit) return false;
  await db
    .update(rateLimitBuckets)
    .set({ count: existing.count + 1, updatedAt: new Date(nowMs) })
    .where(eq(rateLimitBuckets.bucketKey, key));
  return true;
}

/** Magic-link: 3/email/hour + 10/IP/hour. Returns false when blocked. */
export async function allowMagicLinkSend(email: string, ip: string): Promise<boolean> {
  const emailOk = await consume(
    `magic-email:${email.trim().toLowerCase()}`,
    MAGIC_EMAIL_LIMIT,
    MAGIC_EMAIL_WINDOW_MS,
  );
  if (!emailOk) return false;
  return consume(`magic-ip:${ip || 'unknown'}`, MAGIC_IP_LIMIT, MAGIC_IP_WINDOW_MS);
}
