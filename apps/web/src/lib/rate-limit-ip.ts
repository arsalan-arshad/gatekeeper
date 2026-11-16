/**
 * IP bucketing for durable rate-limit keys (RATE-003).
 * IPv4 → /32 (full address). IPv6 → /64 network prefix.
 * Kept in sync with apps/api/src/client-ip.ts (same as email-normalize duplication).
 */

function expandIpv6(ip: string): string[] | null {
  const bare = ip.split('%')[0]?.toLowerCase() ?? '';
  if (!bare.includes(':')) return null;

  const v4Tail = bare.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  let core = bare;
  if (v4Tail) {
    const mappedPrefix = v4Tail[1] ?? '';
    const dotted = v4Tail[2] ?? '';
    const parts = dotted.split('.').map((n) => Number(n));
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
      return null;
    }
    const [a, b, c, d] = parts as [number, number, number, number];
    core = `${mappedPrefix}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }

  if ((core.match(/::/g) ?? []).length > 1) return null;
  const [left = '', right = ''] = core.split('::');
  const leftParts = left ? left.split(':').filter(Boolean) : [];
  const rightParts = right ? right.split(':').filter(Boolean) : [];
  if (!core.includes('::') && leftParts.length !== 8) return null;
  const missing = 8 - leftParts.length - rightParts.length;
  if (missing < 0) return null;
  const full = [...leftParts, ...Array(missing).fill('0'), ...rightParts];
  if (full.length !== 8) return null;
  if (full.some((h) => !/^[0-9a-f]{1,4}$/i.test(h))) return null;
  return full.map((h) => h.padStart(4, '0'));
}

export function rateLimitIpBucket(ip: string): string {
  const raw = (ip || '').trim();
  if (!raw) return 'unknown';

  let cleaned = raw.replace(/^\[|\]$/g, '');
  if (cleaned.endsWith('/64')) {
    cleaned = cleaned.slice(0, -3);
  }

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(cleaned)) {
    return cleaned;
  }

  const hextets = expandIpv6(cleaned);
  if (!hextets) return cleaned || 'unknown';

  const h0 = hextets[0] ?? '';
  const h1 = hextets[1] ?? '';
  const h2 = hextets[2] ?? '';
  const h3 = hextets[3] ?? '';
  const h4 = hextets[4] ?? '';
  const h5 = hextets[5] ?? '';
  const h6 = hextets[6] ?? '0';
  const h7 = hextets[7] ?? '0';
  if (
    h0 === '0000' &&
    h1 === '0000' &&
    h2 === '0000' &&
    h3 === '0000' &&
    h4 === '0000' &&
    h5 === 'ffff'
  ) {
    const hi = Number.parseInt(h6, 16);
    const lo = Number.parseInt(h7, 16);
    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
  }

  return `${[h0, h1, h2, h3].join(':')}::/64`;
}
