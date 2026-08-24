import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth-server';
import { Prisma } from '@prisma/client';

// GET /api/returns/supplier
export async function GET(request: NextRequest) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const supplierId = searchParams.get('supplier_id') || '';
  const status     = searchParams.get('status') || '';
  const from       = searchParams.get('from') || '';
  const to         = searchParams.get('to') || '';
  const limit      = parseInt(searchParams.get('limit') || '50');
  const offset     = parseInt(searchParams.get('offset') || '0');

  const where: Prisma.supplier_return_invoicesWhereInput = {};
  if (supplierId) where.supplier_id = supplierId;
  if (status)     where.status = status;
  if (from || to) {
    where.return_date = {};
    if (from) where.return_date.gte = new Date(from);
    if (to)   where.return_date.lte = new Date(to);
  }

  const [items, total] = await Promise.all([
    prisma.supplier_return_invoices.findMany({
      where,
      orderBy: { return_number: 'desc' },
      take: limit,
      skip: offset,
      include: {
        supplier: { select: { id: true, name: true } },
        creator:  { select: { id: true, full_name: true } },
        _count:   { select: { items: true } },
      },
    }),
    prisma.supplier_return_invoices.count({ where }),
  ]);

  return NextResponse.json(
    { ok: true, data: { items, total, limit, offset } },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

// POST /api/returns/supplier
export async function POST(request: NextRequest) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });

  try {
    const body = await request.json();
    const { items: returnItems, ...returnData } = body;

    // === فاليديشن ===
    if (!Array.isArray(returnItems) || returnItems.length === 0) {
      return NextResponse.json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'يجب إضافة صنف واحد على الأقل' } }, { status: 400 });
    }
    for (const item of returnItems) {
      const qty = Number(item.quantity);
      const cost = Number(item.unit_cost);
      if (!Number.isFinite(qty) || qty <= 0)
        return NextResponse.json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'الكمية يجب أن تكون موجبة' } }, { status: 400 });
      if (!Number.isFinite(cost) || cost < 0)
        return NextResponse.json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'سعر الشراء غير صالح' } }, { status: 400 });
      if (!item.store_id)
        return NextResponse.json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'يجب تحديد المخزن لكل صنف' } }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. رقم المرتجع التسلسلي
      const maxN = await tx.supplier_return_invoices.aggregate({ _max: { return_number: true } });
      const return_number = (maxN._max.return_number || 0) + 1;

      // 2. التحقق من وجود المخزون الكافي قبل الخصم
      for (const item of returnItems) {
        const inv = await tx.inventory.findUnique({
          where: { product_id_store_id: { product_id: item.product_id, store_id: item.store_id } },
        });
        const available = inv ? Number(inv.current_stock) : 0;
        if (available < Number(item.quantity)) {
          const prod = await tx.products.findUnique({ where: { id: item.product_id }, select: { name: true } });
          throw new Error(`المخزون غير كافٍ للصنف "${prod?.name || item.product_id}" (متاح: ${available}, مطلوب: ${item.quantity})`);
        }
      }

      // 3. إنشاء المرتجع
      const returnInvoice = await tx.supplier_return_invoices.create({
        data: {
          return_number,
          return_date:           returnData.return_date ? new Date(returnData.return_date) : new Date(),
          supplier_id:           returnData.supplier_id || null,
          original_purchase_id:  returnData.original_purchase_id || null,
          status:                'مكتملة',
          total_amount:          returnData.total_amount || 0,
          notes:                 returnData.notes || null,
          created_by:            profile.id,
        },
      });

      // 4. إنشاء البنود
      const productIds = returnItems.map((i: any) => i.product_id);
      const products = await tx.products.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true },
      });
      const productMap = new Map(products.map(p => [p.id, p]));

      const itemsToCreate = returnItems.map((item: any) => {
        const product = productMap.get(item.product_id);
        if (!product) throw new Error(`الصنف غير موجود: ${item.product_id}`);
        const line_total = Number(item.quantity) * Number(item.unit_cost);
        return {
          return_id:    returnInvoice.id,
          product_id:   item.product_id,
          product_name: product.name,
          quantity:     item.quantity,
          unit_cost:    item.unit_cost,
          line_total,
          store_id:     item.store_id,
        };
      });
      await tx.supplier_return_invoice_items.createMany({ data: itemsToCreate });

      // 5. خصم المخزون (مرتجع مورد = بضاعة تخرج من المخزن للمورد)
      for (const item of returnItems) {
        await tx.inventory.update({
          where: { product_id_store_id: { product_id: item.product_id, store_id: item.store_id } },
          data: { current_stock: { decrement: item.quantity } },
        });
      }

      // 6. تعديل رصيد المورد (المرتجع ينقص ما علينا له)
      if (returnData.supplier_id && returnData.total_amount) {
        await tx.suppliers.update({
          where: { id: returnData.supplier_id },
          data: { balance: { decrement: Number(returnData.total_amount) } },
        });
      }

      return returnInvoice;
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: 'DB_ERROR', message: e?.message } }, { status: 500 });
  }
}
