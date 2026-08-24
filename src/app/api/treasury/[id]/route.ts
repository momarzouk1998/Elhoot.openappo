import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth-server';

// PATCH /api/treasury/[id] - تعديل خزينة
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentUser();
  if (!profile || !['admin', 'manager', 'accountant'].includes(profile.role)) {
    return NextResponse.json({ ok: false, error: { code: 'FORBIDDEN', message: 'هذه العملية للإدارة فقط' } }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.treasuries.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ ok: false, error: { code: 'NOT_FOUND' } }, { status: 404 });

    if (body.name !== undefined && !String(body.name).trim()) {
      return NextResponse.json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'اسم الخزينة مطلوب' } }, { status: 400 });
    }

    // لو الرصيد الافتتاحي اتعدّل، نعكس نفس الفرق على الرصيد الحالي
    let currentBalanceDelta: number | undefined;
    if (body.opening_balance !== undefined) {
      const oldOpening = Number(existing.opening_balance);
      const newOpening = Number(body.opening_balance);
      currentBalanceDelta = Number(existing.current_balance) + (newOpening - oldOpening);
    }

    const updated = await prisma.treasuries.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: String(body.name).trim() }),
        ...(body.type !== undefined && { type: body.type }),
        ...(body.opening_balance !== undefined && { opening_balance: Number(body.opening_balance) }),
        ...(currentBalanceDelta !== undefined && { current_balance: currentBalanceDelta }),
        ...(body.notes !== undefined && { notes: body.notes || null }),
        ...(body.is_active !== undefined && { is_active: !!body.is_active }),
        updated_at: new Date(),
      },
    });
    return NextResponse.json({ ok: true, data: updated });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: 'DB_ERROR', message: e?.message } }, { status: 500 });
  }
}

// DELETE /api/treasury/[id] - حذف/إخفاء خزينة
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentUser();
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ ok: false, error: { code: 'FORBIDDEN' } }, { status: 403 });
  }

  try {
    const { id } = await params;

    // فحص: هل توجد حركات مرتبطة؟ — منع الحذف نهائياً
    const txCount = await prisma.treasury_transactions.count({ where: { treasury_id: id } });
    if (txCount > 0) {
      return NextResponse.json(
        { ok: false, error: { code: 'HAS_TRANSACTIONS', message: `لا يمكن حذف الخزينة: لها ${txCount} حركة مسجلة. احذف الحركات أولاً.` } },
        { status: 400 }
      );
    }

    await prisma.treasuries.delete({ where: { id } });
    return NextResponse.json({ ok: true, data: { deleted: true } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: 'DB_ERROR', message: e?.message } }, { status: 500 });
  }
}
