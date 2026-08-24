import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-server';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'غير مسجل' } }, { status: 401 });
  }
  return NextResponse.json({ ok: true, data: user });
}
