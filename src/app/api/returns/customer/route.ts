import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth-server';
import { Prisma } from '@prisma/client';

// GET /api/returns/customer
export async function GET(request: NextRequest) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get('customer_id') || '';
  const status     = searchParams.get('status') || '';
  const from       = searchParams.get('from') || '';
  const to         = searchParams.get('to') || '';
  const limit      = parseInt(searchParams.get('limit') || '50');
  const offset     = parseInt(searchParams.get('offset') || '0');

  const where: Prisma.customer_return_invoicesWhereInput = {};
  if (customerId) where.customer_id = customerId;
  if (status)     where.status = status;
  if (from || to) {
    where.return_date = {};
    if (from) where.return_date.gte = new Date(from);
    if (to)   where.return_date.lte = new Date(to);
  }

  const [items, total] = await Promise.all([
    prisma.customer_return_invoices.findMany({
      where,
      orderBy: { return_number: 'desc' },
      take: limit,
      skip: offset,
      include: {
        customer: { select: { id: true, name: true } },
        creator:  { select: { id: true, full_name: true } },
        _count:   { select: { items: true } },
      },
    }),
    prisma.customer_return_invoices.count({ where }),
  ]);

  return NextResponse.json(
    { ok: true, data: { items, total, limit, offset } },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

// POST /api/returns/customer
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
      const price = Number(item.unit_price);
      if (!Number.isFinite(qty) || qty <= 0)
        return NextResponse.json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'الكمية يجب أن تكون موجبة' } }, { status: 400 });
      if (!Number.isFinite(price) || price < 0)
        return NextResponse.json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'السعر غير صالح' } }, { status: 400 });
      if (!item.store_id)
        return NextResponse.json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'يجب تحديد المخزن لكل صنف' } }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. رقم المرتجع التسلسلي
      const maxN = await tx.customer_return_invoices.aggregate({ _max: { return_number: true } });
      const return_number = (maxN._max.return_number || 0) + 1;

      // 2. إنشاء المرتجع
      const returnInvoice = await tx.customer_return_invoices.create({
        data: {
          return_number,
          return_date:          returnData.return_date ? new Date(returnData.return_date) : new Date(),
          customer_id:          returnData.customer_id || null,
          original_invoice_id:  returnData.original_invoice_id || null,
          status:               'مكتملة',
          total_amount:         returnData.total_amount || 0,
          notes:                returnData.notes || null,
          created_by:           profile.id,
        },
      });

      // 3. إنشاء البنود + زيادة المخزون (مرتجع عميل = بضاعة ترجع للمخزن)
      const productIds = returnItems.map((i: any) => i.product_id);
      const products = await tx.products.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true },
      });
      const productMap = new Map(products.map(p => [p.id, p]));

      const itemsToCreate = returnItems.map((item: any) => {
        const product = productMap.get(item.product_id);
        if (!product) throw new Error(`الصنف غير موجود: ${item.product_id}`);
        const line_total = Number(item.quantity) * Number(item.unit_price);
        return {
          return_id:    returnInvoice.id,
          product_id:   item.product_id,
          product_name: product.name,
          quantity:     item.quantity,
          unit_price:   item.unit_price,
          line_total,
          store_id:     item.store_id,
        };
      });
      await tx.customer_return_invoice_items.createMany({ data: itemsToCreate });

      // 4. زيادة المخزون لكل صنف (المرتجع يضيف للمخزن)
      for (const item of returnItems) {
        await tx.inventory.upsert({
          where: { product_id_store_id: { product_id: item.product_id, store_id: item.store_id } },
          create: { product_id: item.product_id, store_id: item.store_id, current_stock: item.quantity },
          update: { current_stock: { increment: item.quantity } },
        });
      }

      // 5. تعديل رصيد العميل (المرتجع ينقص ما عليه)
      if (returnData.customer_id && returnData.total_amount) {
        await tx.customers.update({
          where: { id: returnData.customer_id },
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
