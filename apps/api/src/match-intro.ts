import type { EmailSender } from './email.js';
import { EmailSendError } from './email.js';
import { buildMatchIntroEmail } from './email-templates.js';
import { isEmailSuppressed } from './email-suppression.js';
import {
  claimMatchEmailSlot,
  MATCH_EMAIL_TYPES,
  releaseMatchEmailSlot,
} from './match-outbound-email.js';

export async function sendMatchIntroEmail(input: {
  send: EmailSender;
  matchId: string;
  note: string;
  personA: { name: string; contactEmail: string; summary: string };
  personB: { name: string; contactEmail: string; summary: string };
}): Promise<'sent' | 'failed' | 'skipped'> {
  const claim = await claimMatchEmailSlot({
    matchId: input.matchId,
    emailType: MATCH_EMAIL_TYPES.matchIntro,
  });
  if (!claim.claimed) return 'skipped';

  const recipients: string[] = [];
  if (!(await isEmailSuppressed(input.personA.contactEmail))) {
    recipients.push(input.personA.contactEmail);
  }
  if (!(await isEmailSuppressed(input.personB.contactEmail))) {
    recipients.push(input.personB.contactEmail);
  }
  if (recipients.length === 0) {
    await releaseMatchEmailSlot({
      matchId: input.matchId,
      emailType: MATCH_EMAIL_TYPES.matchIntro,
    });
    return 'failed';
  }

  const content = buildMatchIntroEmail({
    personAName: input.personA.name,
    personASummary: input.personA.summary,
    personBName: input.personB.name,
    personBSummary: input.personB.summary,
    note: input.note,
  });

  try {
    await input.send({
      to: recipients,
      // Both contacts as reply-to so Reply-all works when both were included.
      replyTo: recipients,
      ...content,
    });
    return 'sent';
  } catch (error) {
    if (error instanceof EmailSendError) {
      await releaseMatchEmailSlot({
        matchId: input.matchId,
        emailType: MATCH_EMAIL_TYPES.matchIntro,
      });
      return 'failed';
    }
    await releaseMatchEmailSlot({
      matchId: input.matchId,
      emailType: MATCH_EMAIL_TYPES.matchIntro,
    });
    throw error;
  }
}
