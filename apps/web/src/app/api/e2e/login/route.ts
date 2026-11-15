import { NextResponse } from 'next/server';

import { isE2eLoginEnabled } from '@/lib/e2e-gate';

/** JSON probe — real E2E login uses /e2e/login form (Auth.js redirect). */
export async function GET() {
  if (!isE2eLoginEnabled()) {
    return NextResponse.json({ enabled: false }, { status: 404 });
  }
  return NextResponse.json({ enabled: true, loginPath: '/e2e/login' });
}

export async function POST() {
  if (!isE2eLoginEnabled()) {
    return NextResponse.json({ enabled: false }, { status: 404 });
  }
  return NextResponse.json(
    { error: 'Use /e2e/login form for Auth.js redirect login' },
    { status: 405 },
  );
}
