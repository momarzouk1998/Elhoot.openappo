import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth-server";
import { Prisma } from "@prisma/client";
import { checkRateLimit } from "@/lib/rate-limit";
import { FinancialNotifications } from "@/lib/financial-notifications";

// GET /api/expenses — قائمة المصروفات مع فلترة
export async function GET(request: NextRequest) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") || "";
  const treasuryId = searchParams.get("treasury_id") || "";
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";
  const limit = parseInt(searchParams.get("limit") || "100");
  const offset = parseInt(searchParams.get("offset") || "0");

  const where: Prisma.expensesWhereInput = {};
  if (category) where.category = category;
  if (treasuryId) where.treasury_id = treasuryId;
  if (from || to) {
    where.expense_date = {};
    if (from) where.expense_date.gte = new Date(from);
    if (to) where.expense_date.lte = new Date(to);
  }

  const [items, total, sum] = await Promise.all([
    prisma.expenses.findMany({
      where,
      orderBy: { expense_date: "desc" },
      take: limit,
      skip: offset,
      include: {
        treasury: { select: { id: true, name: true } },
        creator: { select: { id: true, full_name: true } },
      },
    }),
    prisma.expenses.count({ where }),
    prisma.expenses.aggregate({ where, _sum: { amount: true } }),
  ]);

  return NextResponse.json({
    ok: true,
    data: { items, total, total_amount: sum._sum.amount || 0, limit, offset },
  });
}

// POST /api/expenses — إنشاء مصروف + تحديث رصيد الخزينة (transaction)
export async function POST(request: NextRequest) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });

  // Rate limiting للمصروفات - 15 طلب كحد أقصى خلال 10 دقائق
  if (!checkRateLimit(request, `expense_create_${profile.id}`, 15, 600000)) {
    return NextResponse.json(
      { ok: false, error: { code: "RATE_LIMIT_EXCEEDED", message: "تم تجاوز الحد المسموح من المصروفات. حاول مرة أخرى لاحقاً" } },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const { category, description, amount, payment_method, treasury_id, expense_date, notes } = body;

    if (!category || !description || !amount || !treasury_id) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: "الفئة والوصف والمبلغ والخزينة مطلوبة" } },
        { status: 400 }
      );
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return NextResponse.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "المبلغ يجب أن يكون رقم موجب" } }, { status: 400 });
    }

    // Transaction: مصروف + خصم الخزينة + سجل حركة
    const expense = await prisma.$transaction(async (tx) => {
      // 1. تأكد إن الخزينة موجودة
      const treasury = await tx.treasuries.findUnique({ where: { id: treasury_id } });
      if (!treasury) throw new Error("الخزينة غير موجودة");

      // 2. إنشاء المصروف
      const e = await tx.expenses.create({
        data: {
          category,
          description,
          amount: amt,
          payment_method: payment_method || "نقدي",
          treasury_id,
          expense_date: expense_date ? new Date(expense_date) : new Date(),
          notes: notes || null,
          created_by: profile.id,
        },
      });

      // 3. خصم من الخزينة
      await tx.treasuries.update({
        where: { id: treasury_id },
        data: { current_balance: { decrement: amt } },
      });

      // تحقق من الرصيد السالب وإشعار
      const updatedTreasury = await tx.treasuries.findUnique({ where: { id: treasury_id } });
      if (updatedTreasury && Number(updatedTreasury.current_balance) < 0) {
        FinancialNotifications.negativeBalance(treasury.name, Number(updatedTreasury.current_balance));
      }

      // 4. سجل حركة الخزينة
      await tx.treasury_transactions.create({
        data: {
          treasury_id,
          direction: "out",
          amount: amt,
          reference_type: "expense",
          reference_id: e.id,
          status: "accepted",
          by_user_id: profile.id,
        },
      });

      // إشعار للمصروفات الكبيرة (أكثر من 1000 ج)
      if (amt > 1000) {
        FinancialNotifications.largeExpense(amt, description, profile.id);
      }

      return e;
    });

    return NextResponse.json({ ok: true, data: expense });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: "DB_ERROR", message: e?.message || "حدث خطأ" } }, { status: 500 });
  }
}
