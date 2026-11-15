/**
 * Client IP for rate limits.
 *
 * With Fastify `trustProxy` set to Railway hop count, `request.ip` is the
 * real client. Never trust a raw client-supplied `X-Forwarded-For` header
 * (spoofable) — ignore it here.
 */
export function clientIp(request: { ip: string }): string {
  return request.ip || 'unknown';
}
