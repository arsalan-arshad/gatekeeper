import { NextResponse } from 'next/server';

/** JSON probe — real E2E login uses /e2e/login form (Auth.js redirect). */
export async function GET() {
  if (!process.env.E2E_SECRET?.trim()) {
    return NextResponse.json({ enabled: false }, { status: 404 });
  }
  return NextResponse.json({ enabled: true, loginPath: '/e2e/login' });
}
