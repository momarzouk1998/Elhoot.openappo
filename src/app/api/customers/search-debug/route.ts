import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma-direct';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q') || 'مصطفى';

    const matches = await prisma.customers.findMany({
      where: {
        name: { contains: q, mode: 'insensitive' }
      }
    });

    const totalCustomers = await prisma.customers.count();
    const activeCustomers = await prisma.customers.count({ where: { is_active: true } });

    // ترتيب العميل بالاسم لمعرفة موقعه في الـ Limit 200
    const allSorted = await prisma.customers.findMany({
      where: { is_active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' }
    });

    const matchesWithIndex = matches.map(m => {
      const idx = allSorted.findIndex(c => c.id === m.id);
      return {
        id: m.id,
        name: m.name,
        is_active: m.is_active,
        alphabetical_position_in_list: idx + 1,
        would_be_included_in_limit_200: idx < 200,
      };
    });

    return NextResponse.json({
      ok: true,
      query: q,
      total_customers_in_db: totalCustomers,
      active_customers_in_db: activeCustomers,
      matches: matchesWithIndex,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
