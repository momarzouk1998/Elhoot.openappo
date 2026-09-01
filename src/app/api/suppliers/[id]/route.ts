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

// DELETE /api/suppliers/[id] — حذف المورد (يدعم الحذف الشامل مع الفواتير والمدفوعات بعد التأكيد)
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) { // eslint-disable-line @typescript-eslint/no-unused-vars
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  if (profile.role !== 'admin') {
    return NextResponse.json({ ok: false, error: { code: 'FORBIDDEN', message: 'فقط المدير يمكنه حذف المورد' } }, { status: 403 });
  }

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';

    // فحص الحركات المرتبطة بالمورد
    const [purchaseCount, paymentsCount, returnsCount] = await Promise.all([
      prisma.purchase_invoices.count({ where: { supplier_id: id } }),
      prisma.supplier_payments.count({ where: { supplier_id: id } }),
      prisma.supplier_return_invoices.count({ where: { supplier_id: id } }),
    ]);

    const totalTransactions = purchaseCount + paymentsCount + returnsCount;

    // إذا وُجدت حركات ولم يتم إرسال تأكيد force=true
    if (totalTransactions > 0 && !force) {
      return NextResponse.json(
        {
          ok: false,
          requires_confirmation: true,
          counts: { purchases: purchaseCount, payments: paymentsCount, returns: returnsCount },
          message: `⚠️ تنبيه هام: هذا المورد مرتبط بـ:\n• ${purchaseCount} فاتورة مشتريات\n• ${paymentsCount} سند سداد\n• ${returnsCount} فاتورة مرتجع\n\nهل أنت متأكد من حذف المورد وكافة فواتيره ومدفوعاته وسجلاته بالكامل؟ لن يمكن التراجع عن هذه العملية.`,
        },
        { status: 409 }
      );
    }

    // تنفيذ الحذف الشامل داخل Transaction متكاملة
    await prisma.$transaction(async (tx) => {
      // 1. حذف بنود فواتير المشتريات ثم فواتير المشتريات
      const supplierInvoices = await tx.purchase_invoices.findMany({
        where: { supplier_id: id },
        select: { id: true },
      });
      const invoiceIds = supplierInvoices.map((inv) => inv.id);
      if (invoiceIds.length > 0) {
        await tx.purchase_invoice_items.deleteMany({
          where: { purchase_id: { in: invoiceIds } },
        });
        await tx.purchase_invoices.deleteMany({
          where: { supplier_id: id },
        });
      }

      // 2. حذف مدفوعات المورد
      await tx.supplier_payments.deleteMany({
        where: { supplier_id: id },
      });

      // 3. حذف بنود المرتجعات ثم فواتير المرتجعات
      const supplierReturns = await tx.supplier_return_invoices.findMany({
        where: { supplier_id: id },
        select: { id: true },
      });
      const returnIds = supplierReturns.map((r) => r.id);
      if (returnIds.length > 0) {
        await tx.supplier_return_invoice_items.deleteMany({
          where: { return_id: { in: returnIds } },
        });
        await tx.supplier_return_invoices.deleteMany({
          where: { supplier_id: id },
        });
      }

      // 4. حذف المورد نهائياً
      await tx.suppliers.delete({ where: { id } });
    });

    return NextResponse.json({ ok: true, data: { deleted: true } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: 'DB_ERROR', message: e?.message } }, { status: 500 });
  }
}
