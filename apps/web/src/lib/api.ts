const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function apiFetch<T>(
  path: string,
  init: RequestInit & { email?: string } = {},
): Promise<T> {
  const { email, headers, ...rest } = init;
  const response = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      'content-type': 'application/json',
      ...(email ? { 'x-user-email': email } : {}),
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
