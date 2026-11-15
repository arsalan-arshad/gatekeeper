/**
 * Strip CR/LF and HTML-ish markup from email subjects (header injection / XSS in clients).
 */
export function sanitizeEmailSubject(raw: string): string {
  return raw
    .replace(/[\r\n\u0000]+/g, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}
