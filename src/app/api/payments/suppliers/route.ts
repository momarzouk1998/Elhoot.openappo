import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth-server";
import { Prisma } from "@prisma/client";
import { checkRateLimit } from "@/lib/rate-limit";

// GET /api/payments/suppliers — قائمة مدفوعات الموردين
export async function GET(request: NextRequest) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const supplierId = searchParams.get("supplier_id") || "";
  const treasuryId = searchParams.get("treasury_id") || "";
  const method = searchParams.get("payment_method") || "";
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";
  const limit = parseInt(searchParams.get("limit") || "100");
  const offset = parseInt(searchParams.get("offset") || "0");

  const where: Prisma.supplier_paymentsWhereInput = {};
  if (supplierId) where.supplier_id = supplierId;
  if (treasuryId) where.treasury_id = treasuryId;
  if (method) where.payment_method = method;
  if (from || to) {
    where.payment_date = {};
    if (from) where.payment_date.gte = new Date(from);
    if (to) where.payment_date.lte = new Date(to);
  }

  const [items, total, sum] = await Promise.all([
    prisma.supplier_payments.findMany({
      where,
      orderBy: { payment_date: "desc" },
      take: limit,
      skip: offset,
      include: {
        supplier: { select: { id: true, name: true, phone: true } },
        treasury: { select: { id: true, name: true } },
      },
    }),
    prisma.supplier_payments.count({ where }),
    prisma.supplier_payments.aggregate({ where, _sum: { amount: true } }),
  ]);

  return NextResponse.json({
    ok: true,
    data: { items, total, total_amount: sum._sum.amount || 0, limit, offset },
  });
}

// POST /api/payments/suppliers — سداد لمورد (transaction: تحديث رصيد المورد + الخزينة)
export async function POST(request: NextRequest) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });

  // Rate limiting للمدفوعات - 10 طلبات كحد أقصى خلال 5 دقائق
  if (!checkRateLimit(request, `supplier_payment_create_${profile.id}`, 10, 300000)) {
    return NextResponse.json(
      { ok: false, error: { code: "RATE_LIMIT_EXCEEDED", message: "تم تجاوز الحد المسموح من مدفوعات الموردين. حاول مرة أخرى لاحقاً" } },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const { supplier_id, amount, payment_method, treasury_id, purchase_id, payment_date, notes } = body;

    if (!supplier_id || !amount || !treasury_id) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: "المورد والمبلغ والخزينة مطلوبة" } },
        { status: 400 }
      );
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return NextResponse.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "المبلغ يجب أن يكون رقم موجب" } }, { status: 400 });
    }

    const payment = await prisma.$transaction(async (tx) => {
      // 1. تأكد إن المورد موجود
      const supplier = await tx.suppliers.findUnique({ where: { id: supplier_id } });
      if (!supplier) throw new Error("المورد غير موجود");

      // 2. تأكد إن الخزينة موجودة وبها رصيد كافي
      const treasury = await tx.treasuries.findUnique({ where: { id: treasury_id } });
      if (!treasury) throw new Error("الخزينة غير موجودة");
      // السماح بالسالب: تمت إزالة شرط رصيد الخزينة
      // 3. إنشاء السداد
      const sp = await tx.supplier_payments.create({
        data: {
          supplier_id,
          amount: amt,
          payment_method: payment_method || "نقدي",
          treasury_id,
          purchase_id: purchase_id || null,
          payment_date: payment_date ? new Date(payment_date) : new Date(),
          notes: notes || null,
          created_by: profile.id,
        },
      });

      // 4. خصم من رصيد المورد (تسديد مستحقات)
      await tx.suppliers.update({
        where: { id: supplier_id },
        data: { balance: { decrement: amt } },
      });

      // 5. تحديث المبلغ المدفوع على الفاتورة إن وجدت
      if (purchase_id) {
        const purchase = await tx.purchase_invoices.findUnique({ where: { id: purchase_id } });
        if (purchase) {
          const total = Number(purchase.total_amount || 0);
          const paidSoFar = Number(purchase.paid_amount || 0);
          const nextPaid = Math.min(total, paidSoFar + amt);
          await tx.purchase_invoices.update({
            where: { id: purchase_id },
            data: { paid_amount: nextPaid },
          });
        }
      }

      // 6. خصم من الخزينة
      await tx.treasuries.update({
        where: { id: treasury_id },
        data: { current_balance: { decrement: amt } },
      });

      // 7. سجل حركة الخزينة
      await tx.treasury_transactions.create({
        data: {
          treasury_id,
          direction: "out",
          amount: amt,
          reference_type: "supplier_payment",
          reference_id: sp.id,
          status: "accepted",
          by_user_id: profile.id,
        },
      });

      return sp;
    });

    return NextResponse.json({ ok: true, data: payment });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: "DB_ERROR", message: e?.message || "حدث خطأ" } }, { status: 500 });
  }
}
