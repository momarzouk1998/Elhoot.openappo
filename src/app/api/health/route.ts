import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, status: 'healthy', db: 'connected', time: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ ok: false, status: 'unhealthy', error: e?.message }, { status: 500 });
  }
}
