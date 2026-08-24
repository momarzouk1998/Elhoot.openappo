import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth-server';

export async function GET() {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  const treasuries = await prisma.treasuries.findMany({
    where: { is_active: true },
    orderBy: { name: 'asc' },
  });
  return NextResponse.json(
    { ok: true, data: { items: treasuries, total: treasuries.length } },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(request: NextRequest) {
  const profile = await getCurrentUser();
  if (!profile || profile.role === 'rep') {
    return NextResponse.json({ ok: false, error: { code: 'FORBIDDEN', message: 'غير مصرح لك بإضافة خزينة' } }, { status: 403 });
  }
  try {
    const body = await request.json();
    const t = await prisma.treasuries.create({
      data: {
        name: body.name,
        type: body.type || 'رئيسية',
        opening_balance: body.opening_balance || 0,
        current_balance: body.opening_balance || 0,
        notes: body.notes || null,
      },
    });
    return NextResponse.json({ ok: true, data: t });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: 'DB_ERROR', message: e?.message } }, { status: 500 });
  }
}
