import {
  emailSuppressions,
  gateRules,
  introMatches,
  matchDismissals,
  requests,
  users,
} from '@gatekeeper/db';
import { and, desc, eq, gt, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { logAbuse } from '../abuse-log.js';
import { getDb } from '../db.js';
import {
  DIRECTORY_EXCLUDED_HANDLES,
  isDirectoryExcludedEmail,
  toDirectoryPublicEntry,
} from '../directory.js';
import { resolveIntroContactEmail } from '../contact-email.js';
import { createEmailSender } from '../email.js';
import { buildMatchRequestEmail } from '../email-templates.js';
import { isEmailSuppressed } from '../email-suppression.js';
import { judgeRequest } from '../judge.js';
import { createLlm } from '../llm.js';
import { claimMatchDecision, writeMatchDismissalsBothWays } from '../match-decision.js';
import { sendMatchIntroEmail } from '../match-intro.js';
import { claimMatchEmailSlot, MATCH_EMAIL_TYPES } from '../match-outbound-email.js';
import {
  emptyExclusions,
  matchMinSimilarity,
  mutualFitSimilarity,
  rankMatchesForViewer,
  scoreBandFromSimilarity,
  type MatchCandidate,
} from '../matching.js';
import { isIntroMatchPairUniqueViolation } from '../pg-errors.js';
import { captureServerEvent } from '../posthog.js';
import { consumePostgresRateLimit, retryAfterSeconds } from '../rate-limit.js';
import { createMatchToken } from '../tokens.js';

const ALREADY_DECIDED_ERROR = 'Already decided';
const MATCH_EXPIRES_DAYS = 14;

const requestSchema = z.object({
  handle: z
    .string()
    .min(2)
    .max(32)
    .regex(/^[a-z0-9-]+$/i),
  note: z.string().min(20).max(500),
});

const dismissSchema = z.object({
  handle: z
    .string()
    .min(2)
    .max(32)
    .regex(/^[a-z0-9-]+$/i),
});

async function loadOwner(email: string) {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return user ?? null;
}

function publicSummary(user: {
  name: string;
  directoryRole: string | null;
  offersText: string | null;
  bio: string | null;
}): string {
  return [user.name, user.directoryRole, user.offersText || user.bio]
    .filter(Boolean)
    .join(' — ')
    .slice(0, 280);
}

function apiBase(): string {
  return (process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
}

function appBase(): string {
  return (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

async function loadExclusionsForViewer(viewerId: string, viewerEmail: string) {
  const db = getDb();
  const exclusions = emptyExclusions();

  const matchRows = await db
    .select({
      requesterId: introMatches.requesterId,
      recipientId: introMatches.recipientId,
    })
    .from(introMatches)
    .where(or(eq(introMatches.requesterId, viewerId), eq(introMatches.recipientId, viewerId)));
  for (const row of matchRows) {
    exclusions.matchedUserIds.add(row.requesterId === viewerId ? row.recipientId : row.requesterId);
  }

  const dismissRows = await db
    .select()
    .from(matchDismissals)
    .where(or(eq(matchDismissals.userId, viewerId), eq(matchDismissals.dismissedUserId, viewerId)));
  for (const row of dismissRows) {
    exclusions.dismissedUserIds.add(row.userId === viewerId ? row.dismissedUserId : row.userId);
  }

  const outbound = await db
    .select({
      targetUserId: requests.targetUserId,
      decision: requests.decision,
      ownerDecision: requests.ownerDecision,
    })
    .from(requests)
    .where(sql`lower(${requests.senderContact}) = lower(${viewerEmail})`);
  for (const row of outbound) {
    exclusions.priorRequestUserIds.add(row.targetUserId);
    if (row.decision === 'spam' || row.ownerDecision === 'spam') {
      exclusions.spamBlockedUserIds.add(row.targetUserId);
    }
  }

  const inbound = await db
    .select({
      senderContact: requests.senderContact,
      decision: requests.decision,
      ownerDecision: requests.ownerDecision,
    })
    .from(requests)
    .where(eq(requests.targetUserId, viewerId));

  if (inbound.length > 0) {
    const counterparts = await db.select({ id: users.id, email: users.email }).from(users);
    const byEmail = new Map(counterparts.map((u) => [u.email.toLowerCase(), u.id]));
    for (const row of inbound) {
      const id = byEmail.get(row.senderContact.toLowerCase());
      if (!id) continue;
      exclusions.priorRequestUserIds.add(id);
      if (row.decision === 'spam' || row.ownerDecision === 'spam') {
        exclusions.spamBlockedUserIds.add(id);
      }
    }
  }

  return exclusions;
}

async function loadMatchCandidates(): Promise<MatchCandidate[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.directoryOptIn, true),
        sql`${users.wantsEmbedding} IS NOT NULL`,
        sql`${users.offersEmbedding} IS NOT NULL`,
        sql`lower(${users.handle}) NOT IN (${sql.join(
          DIRECTORY_EXCLUDED_HANDLES.map((h) => sql`${h}`),
          sql`, `,
        )})`,
        sql`lower(${users.email}) NOT LIKE ${'%@demo.gatekeeper.local'}`,
        sql`NOT EXISTS (
          SELECT 1 FROM ${emailSuppressions}
          WHERE lower(${emailSuppressions.email}) = lower(${users.email})
        )`,
      ),
    );
  return rows.map((row) => ({
    ...row,
    directoryTags: row.directoryTags ?? [],
    wantsEmbedding: row.wantsEmbedding,
    offersEmbedding: row.offersEmbedding,
  }));
}

export async function registerMatchRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/dashboard/matches', async (request, reply) => {
    const email = request.gatekeeperEmail;
    if (!email) return reply.status(401).send({ error: 'Unauthorized' });

    const user = await loadOwner(email);
    if (!user) return reply.status(404).send({ error: 'Complete onboarding first' });

    if (!user.directoryOptIn) {
      return { optedIn: false, matches: [] };
    }

    const exclusions = await loadExclusionsForViewer(user.id, user.email);
    const candidates = await loadMatchCandidates();
    const viewer: MatchCandidate = {
      ...user,
      directoryTags: user.directoryTags ?? [],
      wantsEmbedding: user.wantsEmbedding,
      offersEmbedding: user.offersEmbedding,
    };
    const ranked = rankMatchesForViewer({
      viewer,
      candidates,
      exclusions,
      minSimilarity: matchMinSimilarity(),
    });
    captureServerEvent(user.id, 'match_shown', { count: ranked.length });
    return {
      optedIn: true,
      matches: ranked.map(({ user: entry, scoreBand, matchId }) => ({
        ...entry,
        scoreBand,
        matchId,
      })),
    };
  });

  app.get('/v1/dashboard/matches/incoming', async (request, reply) => {
    const email = request.gatekeeperEmail;
    if (!email) return reply.status(401).send({ error: 'Unauthorized' });

    const user = await loadOwner(email);
    if (!user) return reply.status(404).send({ error: 'Complete onboarding first' });

    const db = getDb();
    const now = new Date();
    const rows = await db
      .select({
        id: introMatches.id,
        note: introMatches.note,
        similarity: introMatches.similarity,
        createdAt: introMatches.createdAt,
        expiresAt: introMatches.expiresAt,
        requester: {
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
        },
      })
      .from(introMatches)
      .innerJoin(users, eq(users.id, introMatches.requesterId))
      .where(
        and(
          eq(introMatches.recipientId, user.id),
          eq(introMatches.status, 'pending'),
          gt(introMatches.expiresAt, now),
        ),
      )
      .orderBy(desc(introMatches.createdAt))
      .limit(50);

    return {
      incoming: rows.map((row) => ({
        matchId: row.id,
        note: row.note,
        scoreBand: scoreBandFromSimilarity(row.similarity),
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        requester: toDirectoryPublicEntry({
          ...row.requester,
          directoryTags: row.requester.directoryTags ?? [],
        }),
      })),
    };
  });

  app.post('/v1/dashboard/matches/request', async (request, reply) => {
    const email = request.gatekeeperEmail;
    if (!email) return reply.status(401).send({ error: 'Unauthorized' });

    const parsed = requestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const requester = await loadOwner(email);
    if (!requester) return reply.status(404).send({ error: 'Complete onboarding first' });
    if (!requester.directoryOptIn) {
      return reply.status(400).send({ error: 'Join the directory to request intros' });
    }

    const handle = parsed.data.handle.toLowerCase();
    if (handle === requester.handle.toLowerCase()) {
      return reply.status(400).send({ error: 'Cannot request intro with yourself' });
    }

    const db = getDb();
    const [recipient] = await db.select().from(users).where(eq(users.handle, handle)).limit(1);
    if (
      !recipient ||
      !recipient.directoryOptIn ||
      (DIRECTORY_EXCLUDED_HANDLES as readonly string[]).includes(recipient.handle) ||
      isDirectoryExcludedEmail(recipient.email)
    ) {
      return reply.status(404).send({ error: 'User not found' });
    }

    const exclusions = await loadExclusionsForViewer(requester.id, requester.email);
    if (
      exclusions.matchedUserIds.has(recipient.id) ||
      exclusions.dismissedUserIds.has(recipient.id) ||
      exclusions.priorRequestUserIds.has(recipient.id) ||
      exclusions.spamBlockedUserIds.has(recipient.id)
    ) {
      const [existing] = await db
        .select({ id: introMatches.id })
        .from(introMatches)
        .where(
          or(
            and(
              eq(introMatches.requesterId, requester.id),
              eq(introMatches.recipientId, recipient.id),
            ),
            and(
              eq(introMatches.requesterId, recipient.id),
              eq(introMatches.recipientId, requester.id),
            ),
          ),
        )
        .limit(1);
      return {
        status: 'already_requested' as const,
        matchId: existing?.id ?? null,
      };
    }

    const reqLimit = await consumePostgresRateLimit(
      `match-req:${requester.id}`,
      5,
      24 * 60 * 60 * 1000,
    );
    if (!reqLimit.ok) {
      await logAbuse({
        kind: 'rate_limit_ip',
        ip: request.ip,
        detail: `match_req reset_ms=${reqLimit.resetMs}`,
        log: request.log,
      });
      reply.header('retry-after', retryAfterSeconds(reqLimit.resetMs));
      return reply
        .status(429)
        .send({ error: 'Match request rate limit exceeded', retry_after_ms: reqLimit.resetMs });
    }
    const recvLimit = await consumePostgresRateLimit(
      `match-recv:${recipient.id}`,
      10,
      24 * 60 * 60 * 1000,
    );
    if (!recvLimit.ok) {
      await logAbuse({
        kind: 'rate_limit_ip',
        ip: request.ip,
        detail: `match_recv reset_ms=${recvLimit.resetMs}`,
        log: request.log,
      });
      reply.header('retry-after', retryAfterSeconds(recvLimit.resetMs));
      return reply
        .status(429)
        .send({ error: 'Recipient match rate limit exceeded', retry_after_ms: recvLimit.resetMs });
    }

    const similarity =
      mutualFitSimilarity(
        {
          wantsEmbedding: requester.wantsEmbedding,
          offersEmbedding: requester.offersEmbedding,
        },
        {
          wantsEmbedding: recipient.wantsEmbedding,
          offersEmbedding: recipient.offersEmbedding,
        },
      ) ?? 0;

    const [rules] = await db
      .select()
      .from(gateRules)
      .where(eq(gateRules.userId, recipient.id))
      .limit(1);

    let aiScore: number | null = null;
    let aiDecision: 'accept' | 'reject' | 'spam' | null = null;
    let aiReasonPublic: string | null = null;
    let gated = false;

    if (rules) {
      try {
        const llm = createLlm({ maxRetries: 1 });
        const judgment = await judgeRequest(
          {
            message: `${parsed.data.note}\n\nRequester: ${publicSummary(requester)}`,
            senderName: requester.name,
            senderType: 'human',
            senderContact: requester.email,
            userId: recipient.id,
            target: {
              profileEmbedding: recipient.profileEmbedding,
              ruleText: rules.ruleText,
              minRelevance: rules.minRelevance,
              name: recipient.name,
              wantsText: recipient.wantsText,
              neverText: recipient.neverText,
            },
          },
          llm,
        );
        aiScore = judgment.score;
        aiDecision = judgment.decision;
        aiReasonPublic = judgment.reason_public;
        if (judgment.decision !== 'accept' || judgment.score < rules.minRelevance) {
          gated = true;
        }
      } catch (error) {
        request.log.error({ err: error }, 'match judge failed');
        gated = true;
        aiReasonPublic = 'Could not evaluate fit right now';
      }
    }

    const expiresAt = new Date(Date.now() + MATCH_EXPIRES_DAYS * 24 * 60 * 60 * 1000);
    let matchId: string;
    try {
      const [created] = await db
        .insert(introMatches)
        .values({
          requesterId: requester.id,
          recipientId: recipient.id,
          note: parsed.data.note,
          similarity,
          aiScore,
          aiDecision,
          aiReasonPublic,
          status: gated ? 'gated' : 'pending',
          expiresAt,
        })
        .returning({ id: introMatches.id });
      matchId = created!.id;
    } catch (error) {
      if (isIntroMatchPairUniqueViolation(error)) {
        const [existing] = await db
          .select({ id: introMatches.id })
          .from(introMatches)
          .where(
            or(
              and(
                eq(introMatches.requesterId, requester.id),
                eq(introMatches.recipientId, recipient.id),
              ),
              and(
                eq(introMatches.requesterId, recipient.id),
                eq(introMatches.recipientId, requester.id),
              ),
            ),
          )
          .limit(1);
        return {
          status: 'already_requested' as const,
          matchId: existing?.id ?? null,
        };
      }
      throw error;
    }

    const band = scoreBandFromSimilarity(similarity);
    captureServerEvent(requester.id, 'match_requested', { score_band: band });

    if (gated) {
      return {
        status: 'not_a_fit' as const,
        reason: aiReasonPublic,
        matchId,
      };
    }

    if (recipient.notificationEmailMode !== 'off') {
      const claim = await claimMatchEmailSlot({
        matchId,
        emailType: MATCH_EMAIL_TYPES.matchRequestNotify,
      });
      if (claim.claimed && !(await isEmailSuppressed(recipient.email))) {
        const acceptToken = createMatchToken({ matchId, action: 'accept' });
        const declineToken = createMatchToken({ matchId, action: 'decline' });
        const base = apiBase();
        const mail = buildMatchRequestEmail({
          recipientName: recipient.name,
          requesterName: requester.name,
          requesterRole: requester.directoryRole,
          note: parsed.data.note,
          acceptUrl: `${base}/v1/matches/${matchId}/respond?action=accept&token=${encodeURIComponent(acceptToken)}`,
          declineUrl: `${base}/v1/matches/${matchId}/respond?action=decline&token=${encodeURIComponent(declineToken)}`,
          inboxUrl: `${appBase()}/dashboard`,
        });
        try {
          await createEmailSender()({
            to: recipient.email,
            subject: mail.subject,
            html: mail.html,
            text: mail.text,
          });
        } catch (error) {
          request.log.error({ err: error }, 'match request notify failed');
        }
      }
    }

    return { status: 'pending' as const, matchId, scoreBand: band };
  });

  app.post('/v1/dashboard/matches/dismiss', async (request, reply) => {
    const email = request.gatekeeperEmail;
    if (!email) return reply.status(401).send({ error: 'Unauthorized' });
    const parsed = dismissSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    }
    const user = await loadOwner(email);
    if (!user) return reply.status(404).send({ error: 'Complete onboarding first' });
    const db = getDb();
    const [other] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.handle, parsed.data.handle.toLowerCase()))
      .limit(1);
    if (!other) return reply.status(404).send({ error: 'User not found' });
    await writeMatchDismissalsBothWays({ userA: user.id, userB: other.id });
    return { ok: true };
  });

  app.post('/v1/dashboard/matches/:id/accept', async (request, reply) => {
    const email = request.gatekeeperEmail;
    if (!email) return reply.status(401).send({ error: 'Unauthorized' });
    const { id } = request.params as { id: string };
    const user = await loadOwner(email);
    if (!user) return reply.status(404).send({ error: 'Complete onboarding first' });

    const claim = await claimMatchDecision({
      matchId: id,
      recipientId: user.id,
      decision: 'accept',
      status: 'accepted',
    });
    if (!claim.claimed) {
      if (claim.reason === 'not_found') return reply.status(404).send({ error: 'Not found' });
      if (claim.reason === 'expired')
        return reply.status(409).send({ error: ALREADY_DECIDED_ERROR });
      return reply.status(409).send({ error: ALREADY_DECIDED_ERROR });
    }

    captureServerEvent(user.id, 'match_accepted', {
      score_band: scoreBandFromSimilarity(claim.row.similarity),
    });

    const db = getDb();
    const [requester] = await db
      .select()
      .from(users)
      .where(eq(users.id, claim.row.requesterId))
      .limit(1);
    const introEmail = requester
      ? await sendMatchIntroEmail({
          send: createEmailSender(),
          matchId: claim.row.id,
          note: claim.row.note,
          personA: {
            name: requester.name,
            contactEmail: await resolveIntroContactEmail(requester),
            summary: publicSummary(requester),
          },
          personB: {
            name: user.name,
            contactEmail: await resolveIntroContactEmail(user),
            summary: publicSummary(user),
          },
        })
      : ('failed' as const);

    return { ok: true, status: 'accepted' as const, introEmail };
  });

  app.post('/v1/dashboard/matches/:id/resend-intro', async (request, reply) => {
    const email = request.gatekeeperEmail;
    if (!email) return reply.status(401).send({ error: 'Unauthorized' });
    const { id } = request.params as { id: string };
    const user = await loadOwner(email);
    if (!user) return reply.status(404).send({ error: 'Complete onboarding first' });

    const db = getDb();
    const [row] = await db.select().from(introMatches).where(eq(introMatches.id, id)).limit(1);
    if (!row || (row.requesterId !== user.id && row.recipientId !== user.id)) {
      return reply.status(404).send({ error: 'Not found' });
    }
    if (row.status !== 'accepted') {
      return reply.status(409).send({ error: 'Match not accepted' });
    }

    const limit = await consumePostgresRateLimit(
      `match-intro-resend:${id}`,
      3,
      24 * 60 * 60 * 1000,
    );
    if (!limit.ok) {
      reply.header('retry-after', retryAfterSeconds(limit.resetMs));
      return reply.status(429).send({
        error: 'Resend rate limit exceeded',
        retry_after_ms: limit.resetMs,
      });
    }

    const [requester] = await db.select().from(users).where(eq(users.id, row.requesterId)).limit(1);
    const [recipient] = await db.select().from(users).where(eq(users.id, row.recipientId)).limit(1);
    if (!requester || !recipient) {
      return reply.status(404).send({ error: 'Not found' });
    }

    const introEmail = await sendMatchIntroEmail({
      send: createEmailSender(),
      matchId: row.id,
      note: row.note,
      personA: {
        name: requester.name,
        contactEmail: await resolveIntroContactEmail(requester),
        summary: publicSummary(requester),
      },
      personB: {
        name: recipient.name,
        contactEmail: await resolveIntroContactEmail(recipient),
        summary: publicSummary(recipient),
      },
    });
    return { ok: true, introEmail };
  });

  app.post('/v1/dashboard/matches/:id/decline', async (request, reply) => {
    const email = request.gatekeeperEmail;
    if (!email) return reply.status(401).send({ error: 'Unauthorized' });
    const { id } = request.params as { id: string };
    const user = await loadOwner(email);
    if (!user) return reply.status(404).send({ error: 'Complete onboarding first' });

    const claim = await claimMatchDecision({
      matchId: id,
      recipientId: user.id,
      decision: 'reject',
      status: 'declined',
    });
    if (!claim.claimed) {
      if (claim.reason === 'not_found') return reply.status(404).send({ error: 'Not found' });
      return reply.status(409).send({ error: ALREADY_DECIDED_ERROR });
    }

    await writeMatchDismissalsBothWays({
      userA: claim.row.requesterId,
      userB: claim.row.recipientId,
    });
    return { ok: true, status: 'declined' as const };
  });
}
