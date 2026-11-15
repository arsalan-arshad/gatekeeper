import type { NextRequest } from 'next/server';

import { handlers } from '@/auth';
import { MagicLinkLimiterUnavailableError } from '@/lib/magic-rate-limit';

export const { GET } = handlers;

export async function POST(req: NextRequest): Promise<Response> {
  try {
    return await handlers.POST(req);
  } catch (err) {
    if (
      err instanceof MagicLinkLimiterUnavailableError ||
      (err &&
        typeof err === 'object' &&
        'statusCode' in err &&
        (err as { statusCode?: number }).statusCode === 503)
    ) {
      return Response.json({ error: 'Service temporarily unavailable' }, { status: 503 });
    }
    throw err;
  }
}
