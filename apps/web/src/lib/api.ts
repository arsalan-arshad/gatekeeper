import { API_URL } from './api-url';
import { getInternalApiSecret, signInternalToken } from './internal-auth';

/**
 * Server-only fetch to the Gatekeeper API.
 * Signs every call with a short-lived HS256 JWT (INTERNAL_API_SECRET).
 * Never trusts or sends bare x-user-email as proof of identity.
 *
 * Do not import this module from client components — use `@/lib/api-url` for API_URL.
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit & { email?: string } = {},
): Promise<T> {
  if (typeof window !== 'undefined') {
    throw new Error('apiFetch is server-only');
  }

  const { email, headers, ...rest } = init;
  if (!email || !email.includes('@')) {
    throw new Error('apiFetch requires a signed-in user email');
  }

  const secret = getInternalApiSecret();
  const token = signInternalToken(email, secret);

  const response = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      ...headers,
    },
    cache: 'no-store',
  });

  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(body.error || `API ${response.status}`);
  }
  return body;
}

export { API_URL };
