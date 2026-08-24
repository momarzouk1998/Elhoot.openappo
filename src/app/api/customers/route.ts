import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth-server';
import { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search')?.trim() || '';
  const limitParam = searchParams.get('limit');
  const limit = limitParam === 'all' || limitParam === '0' ? 10000 : Math.min(10000, parseInt(limitParam || '1000'));
  const page = parseInt(searchParams.get('page') || '1');
  const offset = (page - 1) * limit;

  const where: Prisma.customersWhereInput = { is_active: true };
  if (search) where.name = { contains: search, mode: 'insensitive' };

  const [items, total] = await Promise.all([
    prisma.customers.findMany({ where, orderBy: { name: 'asc' }, take: limit, skip: offset }),
    prisma.customers.count({ where }),
  ]);
  return NextResponse.json(
    { ok: true, data: { items, total, limit, page } },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(request: NextRequest) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  try {
    const body = await request.json();
    // === فاليديشن ===
    if (!body.name || !String(body.name).trim()) {
      return NextResponse.json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'اسم العميل مطلوب' } }, { status: 400 });
    }
    const opening = Number(body.opening_balance) || 0;
    if (!Number.isFinite(opening)) {
      return NextResponse.json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'الرصيد الافتتاحي غير صالح' } }, { status: 400 });
    }
    const customer = await prisma.customers.create({
      data: {
        name: String(body.name).trim(),
        phone: body.phone || null,
        whatsapp: body.whatsapp || null,
        address: body.address || null,
        opening_balance: opening,
        balance: opening,
        route_days: body.route_days || [],
        notes: body.notes || null,
      },
    });
    return NextResponse.json({ ok: true, data: customer });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: 'DB_ERROR', message: e?.message } }, { status: 500 });
  }
}
