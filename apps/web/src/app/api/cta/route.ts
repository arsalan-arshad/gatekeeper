import { auth } from '@/auth';
import { apiFetch } from '@/lib/api';
import { ctaVariantFromFlags, type CtaVariant } from '@/lib/landing-cta';

export const dynamic = 'force-dynamic';

/**
 * Session → CTA variant only. No email/handle/PII in the response
 * so the cacheable landing page can hydrate CTAs client-side.
 */
export async function GET(): Promise<Response> {
  const session = await auth();
  const email = session?.user?.email ?? null;

  let variant: CtaVariant = 'start_free';
  if (email) {
    let hasPublishedHandle = false;
    try {
      const me = await apiFetch<{
        onboarded: boolean;
        user: { handle: string } | null;
      }>('/v1/onboarding/me', { email });
      hasPublishedHandle = Boolean(me.onboarded && me.user?.handle);
    } catch {
      hasPublishedHandle = false;
    }
    variant = ctaVariantFromFlags({ signedIn: true, hasPublishedHandle });
  }

  return Response.json(
    { variant },
    {
      headers: {
        'Cache-Control': 'private, no-store',
      },
    },
  );
}
