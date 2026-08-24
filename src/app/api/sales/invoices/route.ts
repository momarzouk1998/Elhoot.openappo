import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth-server';
import { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get('customer_id') || '';
  const type = searchParams.get('type') || ''; // عرض سعر | عادية | ضريبية
  const status = searchParams.get('status') || '';
  const from = searchParams.get('from') || '';
  const to = searchParams.get('to') || '';
  const limit = parseInt(searchParams.get('limit') || '50');
  const page = parseInt(searchParams.get('page') || '1');
  const offset = (page - 1) * limit;

  const where: Prisma.sales_invoicesWhereInput = {};
  if (customerId) where.customer_id = customerId;
  if (type) where.invoice_type = type;
  if (status) where.status = status;
  if (from || to) {
    where.invoice_date = {};
    if (from) where.invoice_date.gte = new Date(from);
    if (to) where.invoice_date.lte = new Date(to);
  }

  const [items, total] = await Promise.all([
    prisma.sales_invoices.findMany({
      where,
      orderBy: { invoice_number: 'desc' },
      take: limit,
      skip: offset,
      include: {
        customer: { select: { id: true, name: true } },
        store: { select: { id: true, name: true } },
        creator: { select: { id: true, full_name: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.sales_invoices.count({ where }),
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
    const { items: invoiceItems, paid_amount: rawPaidAmount, payment_method, treasury_id, ...invoiceData } = body;
    const paid_amount = Math.max(0, parseFloat(rawPaidAmount) || 0);

    // === فاليديشن أساسي ===
    if (!Array.isArray(invoiceItems) || invoiceItems.length === 0) {
      return NextResponse.json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'الفاتورة يجب أن تحتوي على صنف واحد على الأقل' } }, { status: 400 });
    }    for (const item of invoiceItems) {
      const qty = Number(item.quantity);
      const price = Number(item.unit_price);
      if (!Number.isFinite(qty) || qty <= 0) {
        return NextResponse.json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'كل صنف يجب أن تكون كميته موجبة' } }, { status: 400 });
      }
      if (!Number.isFinite(price) || price < 0) {
        return NextResponse.json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'سعر الوحدة غير صالح' } }, { status: 400 });
      }
    }

    // تحديد لو هنخصم مخزون (سيتم التحقق داخل الـ transaction مع row lock)
    const isQuotation = invoiceData.invoice_type === 'عرض سعر';
    const willBeCompleted = (invoiceData.status || 'قيد التنفيذ') === 'مكتملة';
    const invoiceTotal = Math.max(0, Number(invoiceData.total || 0));

    // التحقق من أن المدفوع لا يتجاوز الإجمالي — ملاحظة: الدفع الزيادة مسموح به وينعكس كرصيد دائن على العميل
    // لا يوجد منع هنا، السلوك الصحيح هو: netCustomerDebt = total - paid_amount (قد يكون سالب = دائن)

    // === Transaction: invoice + items + (stock decrement if completed) + customer balance + payments ===
    const result = await prisma.$transaction(async (tx) => {
      // 1. Get next invoice number
      const maxInv = await tx.sales_invoices.aggregate({ _max: { invoice_number: true } });
      const invoice_number = (maxInv._max.invoice_number || 0) + 1;

      // 2. Per-customer sequence & balance snapshot
      let customer_seq = 0;
      let prevCustomerBalance: number | null = null;
      let newCustomerBalance: number | null = null;

      if (invoiceData.customer_id) {
        const [maxCust, cust] = await Promise.all([
          tx.sales_invoices.aggregate({
            where: { customer_id: invoiceData.customer_id },
            _max: { customer_seq: true },
          }),
          tx.customers.findUnique({
            where: { id: invoiceData.customer_id },
            select: { balance: true },
          }),
        ]);
        customer_seq = (maxCust._max.customer_seq || 0) + 1;
        if (cust) {
          prevCustomerBalance = Number(cust.balance);
          if (willBeCompleted && !isQuotation) {
            newCustomerBalance = prevCustomerBalance + (invoiceTotal - paid_amount);
          } else {
            newCustomerBalance = prevCustomerBalance;
          }
        }
      }

      // 3. Create invoice with balance snapshot
      const invoice = await tx.sales_invoices.create({
        data: {
          invoice_number,
          invoice_date: invoiceData.invoice_date ? new Date(invoiceData.invoice_date) : new Date(),
          customer_seq,
          customer_id: invoiceData.customer_id || null,
          store_id: invoiceData.store_id || null,
          invoice_type: invoiceData.invoice_type || 'عادية',
          status: invoiceData.status || 'قيد التنفيذ',
          subtotal: invoiceData.subtotal || 0,
          discount: invoiceData.discount || 0,
          total: invoiceTotal,
          paid_amount: paid_amount || 0,
          customer_prev_balance: prevCustomerBalance,
          customer_new_balance: newCustomerBalance,
          notes: invoiceData.notes || null,
          created_by: profile.id,
          salesperson: profile.full_name,
        },
      });

      let totalCost = 0;

      // 4. Batch fetch products للـ items (تحسين N+1)
      const productIds = invoiceItems.map(item => item.product_id);
      const products = await tx.products.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, last_purchase_price: true },
      });
      const productMap = new Map(products.map(p => [p.id, p]));

      // 5. Create items + calculate cost
      const itemsToCreate = [];
      for (const item of invoiceItems) {
        const product = productMap.get(item.product_id);
        if (!product) throw new Error('PRODUCT_NOT_FOUND');

        const line_total = Number(item.quantity) * Number(item.unit_price);
        const unit_cost = Number(product.last_purchase_price);
        const line_cost = Number(item.quantity) * unit_cost;
        totalCost += line_cost;

        itemsToCreate.push({
          invoice_id: invoice.id,
          product_id: item.product_id,
          product_name: product.name,
          row_type: 'بيع',
          quantity: item.quantity,
          unit_price: item.unit_price,
          line_total,
          unit_cost,
          line_cost,
          store_id: item.store_id,
        });
      }

      // Batch create items
      await tx.sales_invoice_items.createMany({ data: itemsToCreate });

      // 6. Decrement inventory (فقط لو مكتملة وليست عرض سعر)
      if (willBeCompleted && !isQuotation) {
        // التحقق من المخزون أولاً مع row lock
        for (const item of invoiceItems) {
          const inv = await tx.inventory.findUnique({
            where: { product_id_store_id: { product_id: item.product_id, store_id: item.store_id } },
          });
          
          const available = inv ? Number(inv.current_stock) : 0;
          if (available < Number(item.quantity)) {
            throw new Error(`الصنف غیر متوفر بالكمية المطلوبة (متاح: ${available})`);
          }
        }
        
        // خصم المخزون بعد التأكد
        for (const item of invoiceItems) {
          // Upsert inventory record
          const inv = await tx.inventory.upsert({
            where: { product_id_store_id: { product_id: item.product_id, store_id: item.store_id } },
            update: {},
            create: { product_id: item.product_id, store_id: item.store_id, current_stock: 0 },
          });
          
          // Decrement stock
          await tx.inventory.update({
            where: { id: inv.id },
            data: { current_stock: { decrement: item.quantity } },
          });
        }
      }

      // 7. Net profit
      const net_profit = invoiceTotal - totalCost;
      await tx.sales_invoices.update({
        where: { id: invoice.id },
        data: { net_profit },
      });

      // 8. Payment and Treasury (فقط لو مكتملة وفيه مبلغ مدفوع)
      if (willBeCompleted && !isQuotation && paid_amount > 0) {
        // البحث عن الخزينة المستهدفة
        let targetTreasuryId = treasury_id;
        if (!targetTreasuryId) {
          const firstTreasury = await tx.treasuries.findFirst({
            where: { is_active: true },
            orderBy: { created_at: 'asc' },
          });
          targetTreasuryId = firstTreasury?.id;
        }

        if (targetTreasuryId) {
          // تسجيل سند تحصيل في حساب العميل والخزينة
          await tx.customer_payments.create({
            data: {
              customer_id: invoiceData.customer_id || null,
              invoice_id: invoice.id,
              amount: paid_amount,
              payment_method: payment_method || 'نقدي',
              treasury_id: targetTreasuryId,
              payment_date: invoice.invoice_date,
              notes: `تحصيل نقدي مع فاتورة مبيعات #${invoice_number}`,
              created_by: profile.id,
            },
          });

          // زيادة رصيد الخزينة
          await tx.treasuries.update({
            where: { id: targetTreasuryId },
            data: { current_balance: { increment: paid_amount } },
          });
        }
      }

      // 9. Customer balance (فقط لو مكتملة)
      if (invoiceData.customer_id && willBeCompleted && !isQuotation) {
        // balance += (total - paid): لو paid > total يصبح سالب = رصيد دائن على العميل (دفعة مقدمة)
        const balanceDelta = invoiceTotal - paid_amount;
        if (balanceDelta !== 0) {
          await tx.customers.update({
            where: { id: invoiceData.customer_id },
            data: { balance: { increment: balanceDelta } },
          });
        }
      }

      return invoice;
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: 'DB_ERROR', message: e?.message } }, { status: 500 });
  }
}

