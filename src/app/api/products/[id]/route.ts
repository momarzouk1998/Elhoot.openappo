import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth-server';

// PATCH /api/products/[id] — تعديل صنف
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  // التعديل مسموح للمدير/الأدمن/المحاسب
  if (profile.role === 'rep') {
    return NextResponse.json({ ok: false, error: { code: 'FORBIDDEN', message: 'لا تملك صلاحية التعديل' } }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await request.json();

    if (body.name !== undefined && !String(body.name).trim()) {
      return NextResponse.json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'اسم الصنف مطلوب' } }, { status: 400 });
    }
    if (body.default_sale_price !== undefined) {
      const sp = Number(body.default_sale_price);
      if (!Number.isFinite(sp) || sp < 0) {
        return NextResponse.json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'سعر البيع غير صالح' } }, { status: 400 });
      }
    }
    if (body.last_purchase_price !== undefined) {
      const cp = Number(body.last_purchase_price);
      if (!Number.isFinite(cp) || cp < 0) {
        return NextResponse.json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'سعر الشراء غير صالح' } }, { status: 400 });
      }
    }

    // تسجيل تغيير سعر البيع في سجل الأسعار (اختياري)
    const existing = await prisma.products.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ ok: false, error: { code: 'NOT_FOUND', message: 'الصنف غير موجود' } }, { status: 404 });
    }

    const updated = await prisma.products.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: String(body.name).trim() }),
        ...(body.category !== undefined && { category: body.category || null }),
        ...(body.unit !== undefined && { unit: body.unit }),
        ...(body.units_per_carton !== undefined && { units_per_carton: Number(body.units_per_carton) || 1 }),
        ...(body.default_sale_price !== undefined && { default_sale_price: Number(body.default_sale_price) }),
        ...(body.reorder_level !== undefined && { reorder_level: Number(body.reorder_level) || 0 }),
        ...(body.last_purchase_price !== undefined && { last_purchase_price: Number(body.last_purchase_price) }),
        ...(body.notes !== undefined && { notes: body.notes || null }),
        updated_at: new Date(),
      },
    });

    return NextResponse.json({ ok: true, data: updated });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: 'DB_ERROR', message: e?.message } }, { status: 500 });
  }
}

// DELETE /api/products/[id] — حذف آمن (soft-delete)
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  if (profile.role === 'rep') {
    return NextResponse.json({ ok: false, error: { code: 'FORBIDDEN', message: 'لا تملك صلاحية الحذف' } }, { status: 403 });
  }

  try {
    const { id } = await params;

    // فحص: هل يوجد مخزون به كمية؟
    const inventoryCount = await prisma.inventory.aggregate({
      where: { product_id: id, current_stock: { gt: 0 } },
      _sum: { current_stock: true },
    });
    if (Number(inventoryCount._sum.current_stock || 0) > 0) {
      return NextResponse.json(
        { ok: false, error: { code: 'HAS_INVENTORY', message: 'لا يمكن الحذف: الصنف له مخزون متاح. تصفّ المخزون أولاً.' } },
        { status: 400 }
      );
    }

    // فحص: هل يوجد فواتير مرتبطة؟ — منع الحذف نهائياً
    const [salesCount, purchaseCount] = await Promise.all([
      prisma.sales_invoice_items.count({ where: { product_id: id } }),
      prisma.purchase_invoice_items.count({ where: { product_id: id } }),
    ]);
    if (salesCount > 0 || purchaseCount > 0) {
      return NextResponse.json(
        { ok: false, error: { code: 'HAS_TRANSACTIONS', message: `لا يمكن حذف الصنف: له ${salesCount} فاتورة بيع و ${purchaseCount} فاتورة شراء. احذف الفواتير أولاً.` } },
        { status: 400 }
      );
    }

    // آمن للحذف الفعلي
    await prisma.products.delete({ where: { id } });
    return NextResponse.json({ ok: true, data: { deleted: true } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: 'DB_ERROR', message: e?.message } }, { status: 500 });
  }
}
