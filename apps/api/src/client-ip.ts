/**
 * Client IP for rate limits.
 *
 * With Fastify `trustProxy: true` (Railway sole ingress; platform overwrites
 * XFF), `request.ip` is the real client. Never trust a raw client-supplied
 * `X-Forwarded-For` header here (spoofable) — use Fastify's derived `ip` only.
 */
export function clientIp(request: { ip: string }): string {
  return request.ip || 'unknown';
}
