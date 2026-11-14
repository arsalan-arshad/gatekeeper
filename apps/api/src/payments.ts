import { billingAccounts, users } from '@gatekeeper/db';
import { eq, sql } from 'drizzle-orm';

import { getDb } from './db.js';

export const PRO_PRICE_USD = 9;
export const DEFAULT_STAKE_CENTS = 100;
export const DEFAULT_INTRO_CREDIT_CENTS = 500;

/** Master switch — all billing side-effects are no-ops when false. */
export function paymentsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.PAYMENTS_ENABLED?.trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

export function stakeCentsFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.STAKE_CENTS ?? DEFAULT_STAKE_CENTS);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : DEFAULT_STAKE_CENTS;
}

export function introCreditCentsFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.INTRO_CREDIT_CENTS ?? DEFAULT_INTRO_CREDIT_CENTS);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : DEFAULT_INTRO_CREDIT_CENTS;
}

export function freeInboxLimit(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.FREE_INBOX_LIMIT ?? 1);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export function proInboxLimit(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.PRO_INBOX_LIMIT ?? 5);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 5;
}

export async function ensureBillingAccount(email: string) {
  const normalized = email.trim().toLowerCase();
  const db = getDb();
  await db
    .insert(billingAccounts)
    .values({ email: normalized, creditsCents: 0 })
    .onConflictDoNothing({ target: billingAccounts.email });
  const [row] = await db
    .select()
    .from(billingAccounts)
    .where(eq(billingAccounts.email, normalized))
    .limit(1);
  return row!;
}

export async function addCredits(email: string, cents: number): Promise<number> {
  const normalized = email.trim().toLowerCase();
  await ensureBillingAccount(normalized);
  const db = getDb();
  const [row] = await db
    .update(billingAccounts)
    .set({
      creditsCents: sql`${billingAccounts.creditsCents} + ${cents}`,
      updatedAt: new Date(),
    })
    .where(eq(billingAccounts.email, normalized))
    .returning({ creditsCents: billingAccounts.creditsCents });
  return row!.creditsCents;
}

export async function tryDeductCredits(
  email: string,
  cents: number,
): Promise<{ ok: true; balance: number } | { ok: false; balance: number }> {
  if (cents <= 0) {
    const account = await ensureBillingAccount(email);
    return { ok: true, balance: account.creditsCents };
  }

  const normalized = email.trim().toLowerCase();
  await ensureBillingAccount(normalized);
  const db = getDb();
  const [row] = await db
    .update(billingAccounts)
    .set({
      creditsCents: sql`${billingAccounts.creditsCents} - ${cents}`,
      updatedAt: new Date(),
    })
    .where(
      sql`${billingAccounts.email} = ${normalized} AND ${billingAccounts.creditsCents} >= ${cents}`,
    )
    .returning({ creditsCents: billingAccounts.creditsCents });

  if (!row) {
    const account = await ensureBillingAccount(normalized);
    return { ok: false, balance: account.creditsCents };
  }
  return { ok: true, balance: row.creditsCents };
}

export type StakeHoldResult =
  { ok: true; stakeCents: number } | { ok: false; error: string; balance: number };

/** Hold optional $1 stake from sender credits when payments are enabled. */
export async function holdSenderStake(options: {
  senderEmail: string;
  stakeCents: number;
  env?: NodeJS.ProcessEnv;
}): Promise<StakeHoldResult> {
  if (!paymentsEnabled(options.env)) {
    return { ok: true, stakeCents: 0 };
  }
  if (options.stakeCents <= 0) {
    return { ok: true, stakeCents: 0 };
  }

  const deducted = await tryDeductCredits(options.senderEmail, options.stakeCents);
  if (!deducted.ok) {
    return {
      ok: false,
      error: `Insufficient credits for $${(options.stakeCents / 100).toFixed(2)} stake`,
      balance: deducted.balance,
    };
  }
  return { ok: true, stakeCents: options.stakeCents };
}

/** Refund stake to sender (accept path or non-spam reject). */
export async function refundStake(senderEmail: string, stakeCents: number): Promise<void> {
  if (!paymentsEnabled() || stakeCents <= 0) return;
  await addCredits(senderEmail, stakeCents);
}

/** Forfeit stake to receiver credits on spam. */
export async function forfeitStakeToReceiver(options: {
  receiverEmail: string;
  stakeCents: number;
}): Promise<void> {
  if (!paymentsEnabled() || options.stakeCents <= 0) return;
  await addCredits(options.receiverEmail, options.stakeCents);
}

/**
 * On receiver Accept: charge pay-per-intro credit, then refund stake to sender.
 */
export async function settleAcceptedIntro(options: {
  senderEmail: string;
  stakeCents: number;
  env?: NodeJS.ProcessEnv;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!paymentsEnabled(options.env)) {
    return { ok: true };
  }

  const introCents = introCreditCentsFromEnv(options.env);
  if (introCents > 0) {
    const charged = await tryDeductCredits(options.senderEmail, introCents);
    if (!charged.ok) {
      return {
        ok: false,
        error: `Insufficient credits for accepted intro (need $${(introCents / 100).toFixed(2)})`,
      };
    }
  }

  await refundStake(options.senderEmail, options.stakeCents);
  return { ok: true };
}

export async function setUserProPlan(options: {
  email: string;
  lemonCustomerId?: string | null;
  lemonSubscriptionId?: string | null;
  active: boolean;
}): Promise<void> {
  const db = getDb();
  const email = options.email.trim().toLowerCase();
  await db
    .update(users)
    .set({
      plan: options.active ? 'pro' : 'free',
      lemonCustomerId: options.lemonCustomerId ?? undefined,
      lemonSubscriptionId: options.active ? (options.lemonSubscriptionId ?? undefined) : null,
    })
    .where(eq(users.email, email));
}

export function paymentsConfigPublic(env: NodeJS.ProcessEnv = process.env) {
  return {
    enabled: paymentsEnabled(env),
    proPriceUsd: PRO_PRICE_USD,
    stakeCents: stakeCentsFromEnv(env),
    introCreditCents: introCreditCentsFromEnv(env),
    freeInboxLimit: freeInboxLimit(env),
    proInboxLimit: proInboxLimit(env),
  };
}
