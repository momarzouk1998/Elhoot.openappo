import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth-server";

// GET /api/treasury/transfers — قائمة التحويلات بين الخزائن
export async function GET(request: NextRequest) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const fromTreasury = searchParams.get("from_treasury_id") || "";
  const toTreasury = searchParams.get("to_treasury_id") || "";
  const status = searchParams.get("status") || "";
  const limit = parseInt(searchParams.get("limit") || "100");
  const offset = parseInt(searchParams.get("offset") || "0");

  const where = {
    reference_type: "treasury_transfer",
  };

  const [items, total] = await Promise.all([
    prisma.treasury_transactions.findMany({
      where,
      orderBy: { transaction_date: "desc" },
      take: limit,
      skip: offset,
      include: {
        treasury: { select: { id: true, name: true } },
        by_user: { select: { id: true, full_name: true } },
      },
    }),
    prisma.treasury_transactions.count({ where }),
  ]);

  return NextResponse.json({ ok: true, data: { items, total, limit, offset } });
}

// POST /api/treasury/transfers — تحويل بين خزائن
export async function POST(request: NextRequest) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });

  // فقط admin و manager يستطيعوا تحويل الأموال بين الخزائن
  if (!['admin', 'manager'].includes(profile.role)) {
    return NextResponse.json({ ok: false, error: { code: "FORBIDDEN", message: "غير مسموح بتحويل الأموال" } }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { from_treasury_id, to_treasury_id, amount, notes, transfer_date } = body;

    if (!from_treasury_id || !to_treasury_id || !amount) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: "الخزينة المصدر والوجهة والمبلغ مطلوبة" } },
        { status: 400 }
      );
    }
    
    if (from_treasury_id === to_treasury_id) {
      return NextResponse.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "لا يمكن التحويل لنفس الخزينة" } }, { status: 400 });
    }

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return NextResponse.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "المبلغ يجب أن يكون رقم موجب" } }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. تحقق من الخزينة المصدر والوجهة
      const [fromTreasury, toTreasury] = await Promise.all([
        tx.treasuries.findUnique({ where: { id: from_treasury_id } }),
        tx.treasuries.findUnique({ where: { id: to_treasury_id } })
      ]);

      if (!fromTreasury) throw new Error("الخزينة المصدر غير موجودة");
      if (!toTreasury) throw new Error("خزينة الوجهة غير موجودة");
      // 1. السماح بالسالب: تمت إزالة شرط رصيد الخزينة المصدر

      // 2. خصم من الخزينة المصدر
      await tx.treasuries.update({
        where: { id: from_treasury_id },
        data: { current_balance: { decrement: amt } },
      });

      // 3. إضافة لخزينة الوجهة
      await tx.treasuries.update({
        where: { id: to_treasury_id },
        data: { current_balance: { increment: amt } },
      });

      const transferDate = transfer_date ? new Date(transfer_date) : new Date();
      const transferId = `transfer_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      // 4. سجل حركة الخصم
      const outTransaction = await tx.treasury_transactions.create({
        data: {
          treasury_id: from_treasury_id,
          direction: "transfer_out",
          amount: amt,
          from_treasury_id,
          to_treasury_id,
          reference_type: "treasury_transfer",
          reference_id: transferId,
          status: "accepted",
          notes: notes || `تحويل إلى ${toTreasury.name}`,
          by_user_id: profile.id,
          transaction_date: transferDate,
        },
      });

      // 5. سجل حركة الإضافة
      await tx.treasury_transactions.create({
        data: {
          treasury_id: to_treasury_id,
          direction: "transfer_in",
          amount: amt,
          from_treasury_id,
          to_treasury_id,
          reference_type: "treasury_transfer",
          reference_id: transferId,
          status: "accepted",
          notes: notes || `تحويل من ${fromTreasury.name}`,
          by_user_id: profile.id,
          transaction_date: transferDate,
        },
      });

      return {
        transfer_id: transferId,
        from_treasury: fromTreasury.name,
        to_treasury: toTreasury.name,
        amount: amt,
        message: `تم تحويل ${amt} ج من ${fromTreasury.name} إلى ${toTreasury.name}`,
      };
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (e: any) {
    const status = e?.message?.includes("غير كافي") ? 400 : 500;
    return NextResponse.json({ ok: false, error: { code: "DB_ERROR", message: e?.message || "حدث خطأ" } }, { status });
  }
}