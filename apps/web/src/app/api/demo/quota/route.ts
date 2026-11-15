import { API_URL } from '@/lib/api';

export async function GET(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for');
  const response = await fetch(`${API_URL}/v1/demo/quota`, {
    method: 'GET',
    headers: {
      ...(forwarded ? { 'x-forwarded-for': forwarded } : {}),
    },
    cache: 'no-store',
  });

  const text = await response.text();
  return new Response(text, {
    status: response.status,
    headers: {
      'content-type': response.headers.get('content-type') ?? 'application/json',
    },
  });
}
