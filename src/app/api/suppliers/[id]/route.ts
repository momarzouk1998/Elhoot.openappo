import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth-server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });

  try {
    const { id } = await params;
    const supplier = await prisma.suppliers.findUnique({
      where: { id }
    });

    if (!supplier || !supplier.is_active) {
      return NextResponse.json({ ok: false, error: { code: 'NOT_FOUND' } }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: supplier });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: 'DB_ERROR', message: e?.message } }, { status: 500 });
  }
}

// PATCH /api/suppliers/[id] — تعديل بيانات المورد
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  if (profile.role === 'rep') {
    return NextResponse.json({ ok: false, error: { code: 'FORBIDDEN', message: 'لا تملك صلاحية التعديل' } }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await request.json();

    if (body.name !== undefined && !String(body.name).trim()) {
      return NextResponse.json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'اسم المورد مطلوب' } }, { status: 400 });
    }

    // تعديل الرصيد الافتتاحي (يأَثر على الرصيد الحالي)
    if (body.opening_balance !== undefined) {
      const newOpening = Number(body.opening_balance);
      if (!Number.isFinite(newOpening)) {
        return NextResponse.json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'الرصيد الافتتاحي غير صالح' } }, { status: 400 });
      }
      return await prisma.$transaction(async (tx) => {
        const existing = await tx.suppliers.findUnique({ where: { id } });
        if (!existing) return NextResponse.json({ ok: false, error: { code: 'NOT_FOUND' } }, { status: 404 });
        const balanceDiff = newOpening - Number(existing.opening_balance);
        const updated = await tx.suppliers.update({
          where: { id },
          data: {
            ...(body.name !== undefined && { name: String(body.name).trim() }),
            ...(body.phone !== undefined && { phone: body.phone || null }),
            ...(body.address !== undefined && { address: body.address || null }),
            ...(body.notes !== undefined && { notes: body.notes || null }),
            opening_balance: newOpening,
            balance: Number(existing.balance) + balanceDiff,
            updated_at: new Date(),
          },
        });
        return NextResponse.json({ ok: true, data: updated });
      });
    }

    const updated = await prisma.suppliers.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: String(body.name).trim() }),
        ...(body.phone !== undefined && { phone: body.phone || null }),
        ...(body.address !== undefined && { address: body.address || null }),
        ...(body.notes !== undefined && { notes: body.notes || null }),
        updated_at: new Date(),
      },
    });

    return NextResponse.json({ ok: true, data: updated });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: 'DB_ERROR', message: e?.message } }, { status: 500 });
  }
}

// DELETE /api/suppliers/[id] — حذف آمن (soft-delete) أو منع لو فيه حركات
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  if (profile.role === 'rep') {
    return NextResponse.json({ ok: false, error: { code: 'FORBIDDEN', message: 'لا تملك صلاحية الحذف' } }, { status: 403 });
  }

  try {
    const { id } = await params;

    const [purchaseCount, paymentsCount] = await Promise.all([
      prisma.purchase_invoices.count({ where: { supplier_id: id } }),
      prisma.supplier_payments.count({ where: { supplier_id: id } }),
    ]);

    if (purchaseCount > 0 || paymentsCount > 0) {
      return NextResponse.json(
        { ok: false, error: { code: 'HAS_TRANSACTIONS', message: `لا يمكن حذف المورد: له ${purchaseCount} فاتورة و ${paymentsCount} مدفوعة. احذف الحركات أولاً.` } },
        { status: 400 }
      );
    }

    await prisma.suppliers.delete({ where: { id } });
    return NextResponse.json({ ok: true, data: { deleted: true } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: 'DB_ERROR', message: e?.message } }, { status: 500 });
  }
}
