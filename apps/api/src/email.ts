import { logResendSendFailure, parseResendErrorName } from './email-log.js';

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  /**
   * Optional Reply-To. Gatekeeper is intentionally not CC'd/BCC'd:
   * we have no cc/bcc support today, and BCC'ing would copy both people's
   * addresses and conversation into a mailbox we'd then have to protect.
   * Privacy first — leave Gatekeeper out of the thread after the intro.
   */
  replyTo?: string | string[];
};

export type SendEmailResult = {
  id: string;
  mode: 'resend' | 'console';
};

export type EmailSender = (input: SendEmailInput) => Promise<SendEmailResult>;

export class EmailSendError extends Error {
  readonly status: number;
  readonly errorName: string;

  constructor(status: number, errorName: string) {
    super(`Email send failed (${status}): ${errorName}`);
    this.name = 'EmailSendError';
    this.status = status;
    this.errorName = errorName;
  }
}

const sentLog: SendEmailInput[] = [];

/** Test helper — emails captured when using the console sender. */
export function getConsoleEmailLog(): readonly SendEmailInput[] {
  return sentLog;
}

export function clearConsoleEmailLog(): void {
  sentLog.length = 0;
}

export function createConsoleEmailSender(log: SendEmailInput[] = sentLog): EmailSender {
  return async (input) => {
    log.push(input);
    const recipients = Array.isArray(input.to) ? input.to.join(', ') : input.to;
    console.info(
      `\n[gatekeeper:email] To: ${recipients}\nSubject: ${input.subject}\n${input.text}\n`,
    );
    return { id: `console-${log.length}`, mode: 'console' };
  };
}

export function createResendEmailSender(options: {
  apiKey: string;
  from: string;
  fetchImpl?: typeof fetch;
  kind?: string;
}): EmailSender {
  const fetchImpl = options.fetchImpl ?? fetch;
  const kind = options.kind ?? 'email';
  return async (input) => {
    const payload: Record<string, unknown> = {
      from: options.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    };
    if (input.replyTo) {
      payload.reply_to = input.replyTo;
    }
    // Never add cc/bcc — privacy first (see SendEmailInput.replyTo comment).

    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const raw = await response.text();
      const errorName = parseResendErrorName(raw) ?? 'unknown';
      logResendSendFailure({
        status: response.status,
        errorName,
        recipients: input.to,
        kind,
      });
      throw new EmailSendError(response.status, errorName);
    }

    const body = (await response.json()) as { id?: string };
    return { id: body.id ?? 'resend', mode: 'resend' };
  };
}

/** Prefer Resend when `RESEND_API_KEY` is set; otherwise log to the API console. */
export function createEmailSender(env: NodeJS.ProcessEnv = process.env): EmailSender {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim() || 'Gatekeeper <onboarding@resend.dev>';
  if (!apiKey) {
    return createConsoleEmailSender();
  }
  return createResendEmailSender({ apiKey, from });
}
