/** User-facing copy when Resend (or the send path) fails. */
export const MAGIC_LINK_SEND_FAILED_MESSAGE =
  "We couldn't send your sign-in email right now. Please try again in a few minutes.";

/** Mask an email for logs: `j***@domain` — never log the full address. */
export function maskEmailForLog(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0 || at === trimmed.length - 1) return '***';
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const first = local.charAt(0) || '*';
  return `${first}***@${domain}`;
}

export function parseResendErrorName(body: string): string | undefined {
  try {
    const json = JSON.parse(body) as { name?: unknown; error?: unknown; message?: unknown };
    if (typeof json.name === 'string' && json.name.trim()) return json.name.trim();
    if (typeof json.error === 'string' && json.error.trim()) return json.error.trim();
    if (typeof json.message === 'string' && json.message.trim()) return json.message.trim();
  } catch {
    /* non-JSON body */
  }
  return undefined;
}

export function logResendMagicLinkFailure(options: {
  status: number;
  errorName?: string;
  email: string;
  log?: (message: string) => void;
}): void {
  const logger = options.log ?? ((message: string) => console.error(message));
  const name = options.errorName?.trim() || 'unknown';
  logger(
    `[gatekeeper] Resend magic-link send failed status=${options.status} name=${name} email=${maskEmailForLog(options.email)}`,
  );
}

export type SendMagicLinkEmailInput = {
  identifier: string;
  url: string;
  apiKey: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  fetchImpl?: typeof fetch;
  log?: (message: string) => void;
};

/**
 * POST to Resend. On non-2xx: log status + error name with masked email
 * (never API key, token, or magic-link URL), then throw the user-facing message.
 */
export async function sendMagicLinkViaResend(input: SendMagicLinkEmailInput): Promise<void> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: input.from,
      to: input.identifier,
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });

  if (response.ok) return;

  const raw = await response.text();
  const errorName = parseResendErrorName(raw);
  logResendMagicLinkFailure({
    status: response.status,
    errorName,
    email: input.identifier,
    log: input.log,
  });
  throw new Error(MAGIC_LINK_SEND_FAILED_MESSAGE);
}
