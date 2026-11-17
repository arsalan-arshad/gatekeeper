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

export function logResendSendFailure(options: {
  status: number;
  errorName?: string;
  recipients: string | string[];
  kind: string;
  log?: (message: string) => void;
}): void {
  const logger = options.log ?? ((message: string) => console.error(message));
  const name = options.errorName?.trim() || 'unknown';
  const list = Array.isArray(options.recipients) ? options.recipients : [options.recipients];
  const masked = list.map(maskEmailForLog).join(',');
  logger(
    `[gatekeeper] Resend send failed kind=${options.kind} status=${options.status} name=${name} recipients=${masked}`,
  );
}
