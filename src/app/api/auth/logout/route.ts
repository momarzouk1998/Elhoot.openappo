import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME } from '@/lib/db/auth';

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true, data: { success: true } });
  response.cookies.set(COOKIE_NAME, '', { path: '/', maxAge: 0 });
  return response;
}
