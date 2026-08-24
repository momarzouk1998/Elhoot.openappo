import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth-server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });

  try {
    const { id } = await params;
    const customer = await prisma.customers.findUnique({
      where: { id }
    });

    if (!customer || !customer.is_active) {
      return NextResponse.json({ ok: false, error: { code: 'NOT_FOUND' } }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: customer });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: 'DB_ERROR', message: e?.message } }, { status: 500 });
  }
}

// PATCH /api/customers/[id] — تعديل بيانات العميل
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
      return NextResponse.json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'اسم العميل مطلوب' } }, { status: 400 });
    }

    // تعديل الرصيد الافتتاحي يتطلب transaction (يأثر على الرصيد الحالي)
    if (body.opening_balance !== undefined) {
      const newOpening = Number(body.opening_balance);
      if (!Number.isFinite(newOpening)) {
        return NextResponse.json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'الرصيد الافتتاحي غير صالح' } }, { status: 400 });
      }
      return await prisma.$transaction(async (tx) => {
        const existing = await tx.customers.findUnique({ where: { id } });
        if (!existing) return NextResponse.json({ ok: false, error: { code: 'NOT_FOUND' } }, { status: 404 });
        // الفرق بين الرصيد الجديد والحالي = رصيد الحركة الإضافي على العميل
        const balanceDiff = newOpening - Number(existing.opening_balance);
        const updated = await tx.customers.update({
          where: { id },
          data: {
            ...(body.name !== undefined && { name: String(body.name).trim() }),
            ...(body.phone !== undefined && { phone: body.phone || null }),
            ...(body.whatsapp !== undefined && { whatsapp: body.whatsapp || null }),
            ...(body.address !== undefined && { address: body.address || null }),
            ...(body.route_days !== undefined && { route_days: body.route_days }),
            ...(body.notes !== undefined && { notes: body.notes || null }),
            opening_balance: newOpening,
            balance: Number(existing.balance) + balanceDiff,
            updated_at: new Date(),
          },
        });
        return NextResponse.json({ ok: true, data: updated });
      });
    }

    const updated = await prisma.customers.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: String(body.name).trim() }),
        ...(body.phone !== undefined && { phone: body.phone || null }),
        ...(body.whatsapp !== undefined && { whatsapp: body.whatsapp || null }),
        ...(body.address !== undefined && { address: body.address || null }),
        ...(body.route_days !== undefined && { route_days: body.route_days }),
        ...(body.notes !== undefined && { notes: body.notes || null }),
        updated_at: new Date(),
      },
    });

    return NextResponse.json({ ok: true, data: updated });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: 'DB_ERROR', message: e?.message } }, { status: 500 });
  }
}

// DELETE /api/customers/[id] — حذف عميل (يدعم الحذف الشامل مع الفواتير والمدفوعات بعد التأكيد)
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  if (profile.role === 'rep') {
    return NextResponse.json({ ok: false, error: { code: 'FORBIDDEN', message: 'لا تملك صلاحية الحذف' } }, { status: 403 });
  }

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';

    // فحص الحركات المرتبطة بالعميل
    const [salesCount, paymentsCount, returnsCount] = await Promise.all([
      prisma.sales_invoices.count({ where: { customer_id: id } }),
      prisma.customer_payments.count({ where: { customer_id: id } }),
      prisma.customer_return_invoices.count({ where: { customer_id: id } }),
    ]);

    const totalTransactions = salesCount + paymentsCount + returnsCount;

    // إذا وُجدت حركات ولم يتم إرسال تأكيد force=true
    if (totalTransactions > 0 && !force) {
      return NextResponse.json(
        {
          ok: false,
          requires_confirmation: true,
          counts: { sales: salesCount, payments: paymentsCount, returns: returnsCount },
          message: `⚠️ تنبيه هام: هذا العميل مرتبط بـ:\n• ${salesCount} فاتورة مبيعات\n• ${paymentsCount} سند تحصيل\n• ${returnsCount} فاتورة مرتجع\n\nهل أنت متأكد من حذف العميل وكافة فواتيره ومدفوعاته وسجلاته بالكامل؟ لن يمكن التراجع عن هذه العملية.`,
        },
        { status: 409 }
      );
    }

    // تنفيذ الحذف الشامل داخل Transaction متكاملة
    await prisma.$transaction(async (tx) => {
      // 1. حذف بنود فواتير المبيعات ثم فواتير المبيعات
      const customerInvoices = await tx.sales_invoices.findMany({
        where: { customer_id: id },
        select: { id: true },
      });
      const invoiceIds = customerInvoices.map((inv) => inv.id);
      if (invoiceIds.length > 0) {
        await tx.sales_invoice_items.deleteMany({
          where: { invoice_id: { in: invoiceIds } },
        });
        await tx.sales_invoices.deleteMany({
          where: { customer_id: id },
        });
      }

      // 2. حذف مدفوعات العميل
      await tx.customer_payments.deleteMany({
        where: { customer_id: id },
      });

      // 3. حذف بنود المرتجعات ثم فواتير المرتجعات
      const customerReturns = await tx.customer_return_invoices.findMany({
        where: { customer_id: id },
        select: { id: true },
      });
      const returnIds = customerReturns.map((r) => r.id);
      if (returnIds.length > 0) {
        await tx.customer_return_invoice_items.deleteMany({
          where: { return_id: { in: returnIds } },
        });
        await tx.customer_return_invoices.deleteMany({
          where: { customer_id: id },
        });
      }

      // 4. حذف العميل نهائياً
      await tx.customers.delete({ where: { id } });
    });

    return NextResponse.json({ ok: true, data: { deleted: true } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: 'DB_ERROR', message: e?.message } }, { status: 500 });
  }
}
