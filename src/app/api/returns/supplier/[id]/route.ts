import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth-server';

// GET /api/returns/supplier/[id]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });

  const { id } = await params;
  const ret = await prisma.supplier_return_invoices.findUnique({
    where: { id },
    include: {
      supplier: { select: { id: true, name: true, phone: true } },
      creator:  { select: { id: true, full_name: true } },
      items: {
        include: { product: { select: { id: true, name: true } } },
      },
    },
  });
  if (!ret) return NextResponse.json({ ok: false, error: { code: 'NOT_FOUND' } }, { status: 404 });
  return NextResponse.json({ ok: true, data: ret });
}

// DELETE /api/returns/supplier/[id] — إلغاء المرتجع (عكس التأثير)
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const permanent = searchParams.get('permanent') === 'true';

    const ret = await prisma.supplier_return_invoices.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!ret) return NextResponse.json({ ok: false, error: { code: 'NOT_FOUND' } }, { status: 404 });

    if (ret.created_by !== profile.id && profile.role !== 'admin') {
      return NextResponse.json({ ok: false, error: { code: 'FORBIDDEN' } }, { status: 403 });
    }

    // حذف نهائي — للأدمن فقط
    if (permanent) {
      if (profile.role !== 'admin') {
        return NextResponse.json({ ok: false, error: { code: 'FORBIDDEN', message: 'الحذف النهائي للأدمن فقط' } }, { status: 403 });
      }
      await prisma.$transaction(async (tx) => {
        await tx.supplier_return_invoice_items.deleteMany({ where: { return_id: id } });
        await tx.supplier_return_invoices.delete({ where: { id } });
      });
      return NextResponse.json({ ok: true, data: { message: 'تم حذف المرتجع نهائياً' } });
    }

    if (ret.status === 'ملغاة') {
      return NextResponse.json({ ok: false, error: { code: 'ALREADY_CANCELLED' } }, { status: 400 });
    }

    // إلغاء مرتجع المورد = عكس التأثير (زيادة المخزون + إرجاع رصيد المورد)
    await prisma.$transaction(async (tx) => {
      // إعادة البضاعة للمخزن
      for (const item of ret.items) {
        if (!item.store_id) continue;
        await tx.inventory.upsert({
          where: { product_id_store_id: { product_id: item.product_id, store_id: item.store_id } },
          create: { product_id: item.product_id, store_id: item.store_id, current_stock: Number(item.quantity) },
          update: { current_stock: { increment: item.quantity } },
        });
      }

      // إرجاع رصيد المورد
      if (ret.supplier_id) {
        await tx.suppliers.update({
          where: { id: ret.supplier_id },
          data: { balance: { increment: Number(ret.total_amount) } },
        });
      }

      await tx.supplier_return_invoices.update({
        where: { id },
        data: { status: 'ملغاة', updated_at: new Date() },
      });
    });

    return NextResponse.json({ ok: true, data: { message: 'تم إلغاء المرتجع' } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: 'DB_ERROR', message: e?.message } }, { status: 500 });
  }
}
