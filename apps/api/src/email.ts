export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
};

export type SendEmailResult = {
  id: string;
  mode: 'resend' | 'console';
};

export type EmailSender = (input: SendEmailInput) => Promise<SendEmailResult>;

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
}): EmailSender {
  const fetchImpl = options.fetchImpl ?? fetch;
  return async (input) => {
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: options.from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Resend error: ${await response.text()}`);
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
