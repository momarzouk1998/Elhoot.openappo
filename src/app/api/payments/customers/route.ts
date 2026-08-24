import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth-server";
import { Prisma } from "@prisma/client";
import { checkRateLimit } from "@/lib/rate-limit";

// GET /api/payments/customers — قائمة تحصيلات العملاء
export async function GET(request: NextRequest) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get("customer_id") || "";
  const treasuryId = searchParams.get("treasury_id") || "";
  const method = searchParams.get("payment_method") || "";
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";
  const limit = parseInt(searchParams.get("limit") || "100");
  const offset = parseInt(searchParams.get("offset") || "0");

  const where: Prisma.customer_paymentsWhereInput = {};
  if (customerId) where.customer_id = customerId;
  if (treasuryId) where.treasury_id = treasuryId;
  if (method) where.payment_method = method;
  if (from || to) {
    where.payment_date = {};
    if (from) where.payment_date.gte = new Date(from);
    if (to) where.payment_date.lte = new Date(to);
  }

  const [items, total, sum] = await Promise.all([
    prisma.customer_payments.findMany({
      where,
      orderBy: { payment_date: "desc" },
      take: limit,
      skip: offset,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        treasury: { select: { id: true, name: true } },
        creator: { select: { id: true, full_name: true } },
      },
    }),
    prisma.customer_payments.count({ where }),
    prisma.customer_payments.aggregate({ where, _sum: { amount: true } }),
  ]);

  return NextResponse.json({
    ok: true,
    data: { items, total, total_amount: sum._sum.amount || 0, limit, offset },
  });
}

// POST /api/payments/customers — تحصيل من عميل (transaction: تحديث رصيد العميل + الخزينة)
export async function POST(request: NextRequest) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });

  // Rate limiting للمدفوعات - 10 طلبات كحد أقصى خلال 5 دقائق
  if (!checkRateLimit(request, `payment_create_${profile.id}`, 10, 300000)) {
    return NextResponse.json(
      { ok: false, error: { code: "RATE_LIMIT_EXCEEDED", message: "تم تجاوز الحد المسموح من المدفوعات. حاول مرة أخرى لاحقاً" } },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const { customer_id, amount, payment_method, treasury_id, invoice_id, payment_date, notes } = body;

    if (!customer_id || !amount || !treasury_id) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: "العميل والمبلغ والخزينة مطلوبة" } },
        { status: 400 }
      );
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return NextResponse.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "المبلغ يجب أن يكون رقم موجب" } }, { status: 400 });
    }

    const payment = await prisma.$transaction(async (tx) => {
      // 1. تأكد إن العميل موجود
      const customer = await tx.customers.findUnique({ where: { id: customer_id } });
      if (!customer) throw new Error("العميل غير موجود");

      // 2. تأكد إن الخزينة موجودة
      const treasury = await tx.treasuries.findUnique({ where: { id: treasury_id } });
      if (!treasury) throw new Error("الخزينة غير موجودة");

      // 3. إنشاء التحصيل
      const cp = await tx.customer_payments.create({
        data: {
          customer_id,
          amount: amt,
          payment_method: payment_method || "نقدي",
          treasury_id,
          invoice_id: invoice_id || null,
          payment_date: payment_date ? new Date(payment_date) : new Date(),
          notes: notes || null,
          created_by: profile.id,
        },
      });

      // 4. خصم من رصيد العميل (تسديد دين)
      await tx.customers.update({
        where: { id: customer_id },
        data: { balance: { decrement: amt } },
      });

      // 5. إعادة حساب المبلغ المدفوع والرصيد الجديد على الفاتورة من سندات التحصيل الفعلية
      if (invoice_id) {
        const invoice = await tx.sales_invoices.findUnique({ where: { id: invoice_id } });
        if (invoice) {
          const allPaid = await tx.customer_payments.aggregate({
            where: { invoice_id },
            _sum: { amount: true },
          });
          const newPaid = Math.min(Number(invoice.total), Number(allPaid._sum.amount || 0));
          const updatedNewBal = invoice.customer_prev_balance !== null
            ? Number(invoice.customer_prev_balance) + Number(invoice.total) - newPaid
            : null;
          await tx.sales_invoices.update({
            where: { id: invoice_id },
            data: {
              paid_amount: newPaid,
              ...(updatedNewBal !== null ? { customer_new_balance: updatedNewBal } : {}),
            },
          });
        }
      }

      // 6. إضافة للخزينة
      await tx.treasuries.update({
        where: { id: treasury_id },
        data: { current_balance: { increment: amt } },
      });

      // 7. سجل حركة الخزينة
      await tx.treasury_transactions.create({
        data: {
          treasury_id,
          direction: "in",
          amount: amt,
          reference_type: "customer_payment",
          reference_id: cp.id,
          status: "accepted",
          by_user_id: profile.id,
        },
      });

      return cp;
    });

    return NextResponse.json({ ok: true, data: payment });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: "DB_ERROR", message: e?.message || "حدث خطأ" } }, { status: 500 });
  }
}
