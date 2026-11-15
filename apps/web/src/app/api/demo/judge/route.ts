import { API_URL } from '@/lib/api';

export async function POST(request: Request) {
  const body = await request.text();
  const forwarded = request.headers.get('x-forwarded-for');
  const response = await fetch(`${API_URL}/v1/demo/judge`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(forwarded ? { 'x-forwarded-for': forwarded } : {}),
    },
    body,
    cache: 'no-store',
  });

  const text = await response.text();
  return new Response(text, {
    status: response.status,
    headers: {
      'content-type': response.headers.get('content-type') ?? 'application/json',
      ...(response.headers.get('retry-after')
        ? { 'retry-after': response.headers.get('retry-after')! }
        : {}),
    },
  });
}
