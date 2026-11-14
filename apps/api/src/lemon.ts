import { createHmac, timingSafeEqual } from 'node:crypto';

export type LemonCheckoutKind = 'pro' | 'credits';

export type CreateCheckoutInput = {
  kind: LemonCheckoutKind;
  email: string;
  /** For credits packs — how many cents of credit the variant represents (custom data). */
  creditCents?: number;
  redirectUrl?: string;
};

export type LemonCheckoutResult = {
  url: string;
  id: string;
};

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) {
    throw new Error(`Missing ${key}`);
  }
  return value;
}

export function verifyLemonWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!signatureHeader) return false;
  const digest = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(digest);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function createLemonCheckout(
  input: CreateCheckoutInput,
  options?: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch },
): Promise<LemonCheckoutResult> {
  const env = options?.env ?? process.env;
  const fetchImpl = options?.fetchImpl ?? fetch;

  const apiKey = requireEnv(env, 'LEMON_SQUEEZY_API_KEY');
  const storeId = requireEnv(env, 'LEMON_SQUEEZY_STORE_ID');
  const variantId =
    input.kind === 'pro'
      ? requireEnv(env, 'LEMON_SQUEEZY_PRO_VARIANT_ID')
      : requireEnv(env, 'LEMON_SQUEEZY_CREDITS_VARIANT_ID');

  const response = await fetchImpl('https://api.lemonsqueezy.com/v1/checkouts', {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: {
            email: input.email,
            custom: {
              gatekeeper_kind: input.kind,
              gatekeeper_email: input.email,
              credit_cents: String(input.creditCents ?? env.CREDITS_PACK_CENTS ?? '2500'),
            },
          },
          product_options: input.redirectUrl ? { redirect_url: input.redirectUrl } : undefined,
        },
        relationships: {
          store: { data: { type: 'stores', id: storeId } },
          variant: { data: { type: 'variants', id: variantId } },
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Lemon Squeezy checkout failed: ${await response.text()}`);
  }

  const json = (await response.json()) as {
    data?: { id?: string; attributes?: { url?: string } };
  };
  const url = json.data?.attributes?.url;
  const id = json.data?.id;
  if (!url || !id) {
    throw new Error('Lemon Squeezy checkout response missing url/id');
  }
  return { url, id };
}

export type LemonWebhookEvent = {
  meta: {
    event_name: string;
    custom_data?: Record<string, string>;
  };
  data: {
    id: string;
    type: string;
    attributes: Record<string, unknown>;
  };
};

export function parseLemonWebhook(rawBody: string): LemonWebhookEvent {
  return JSON.parse(rawBody) as LemonWebhookEvent;
}

export function extractEmailFromLemonEvent(event: LemonWebhookEvent): string | null {
  const custom = event.meta.custom_data?.gatekeeper_email;
  if (custom) return custom.toLowerCase();

  const attrs = event.data.attributes;
  const userEmail = attrs.user_email;
  if (typeof userEmail === 'string') return userEmail.toLowerCase();

  const customerEmail = (attrs.customer_id && attrs.email) || attrs.email;
  if (typeof customerEmail === 'string') return customerEmail.toLowerCase();

  return null;
}
