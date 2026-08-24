import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth-server";

// GET /api/expenses/[id] - جلب تفاصيل مصروف
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });

  try {
    const { id } = await params;
    const expense = await prisma.expenses.findUnique({
      where: { id },
      include: {
        treasury: { select: { id: true, name: true } },
        creator: { select: { id: true, full_name: true } },
      },
    });

    if (!expense) return NextResponse.json({ ok: false, error: { code: "NOT_FOUND" } }, { status: 404 });
    return NextResponse.json({ ok: true, data: expense });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: "DB_ERROR", message: e?.message } }, { status: 500 });
  }
}

// PATCH /api/expenses/[id] - تعديل مصروف
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });

  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.expenses.findUnique({
      where: { id },
      include: { treasury: true },
    });

    if (!existing) return NextResponse.json({ ok: false, error: { code: "NOT_FOUND" } }, { status: 404 });

    // فقط المنشئ أو admin
    if (existing.created_by !== profile.id && profile.role !== 'admin') {
      return NextResponse.json({ ok: false, error: { code: "FORBIDDEN" } }, { status: 403 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. احسب الفرق في المبلغ
      const oldAmount = Number(existing.amount);
      const newAmount = Number(body.amount || oldAmount);
      const amountDiff = newAmount - oldAmount;

      // 2. تحديث المصروف
      const updated = await tx.expenses.update({
        where: { id },
        data: {
          category: body.category || existing.category,
          description: body.description || existing.description,
          amount: newAmount,
          payment_method: body.payment_method || existing.payment_method,
          treasury_id: body.treasury_id || existing.treasury_id,
          expense_date: body.expense_date ? new Date(body.expense_date) : existing.expense_date,
          notes: body.notes !== undefined ? body.notes : existing.notes,
        },
      });

      // 3. تعديل أرصدة الخزائن
      if (body.treasury_id && body.treasury_id !== existing.treasury_id) {
        // نقل من خزينة لأخرى
        if (existing.treasury_id) {
          await tx.treasuries.update({
            where: { id: existing.treasury_id },
            data: { current_balance: { increment: oldAmount } }, // إرجاع المبلغ القديم
          });
        }
        
        // تأكد من رصيد الخزينة الجديدة
        const newTreasury = await tx.treasuries.findUnique({ where: { id: body.treasury_id } });
        if (!newTreasury) throw new Error("الخزينة الجديدة غير موجودة");
        // السماح بالسالب: تمت إزالة شرط رصيد الخزينة الجديدة

        await tx.treasuries.update({
          where: { id: body.treasury_id },
          data: { current_balance: { decrement: newAmount } },
        });
      } else if (amountDiff !== 0 && existing.treasury_id) {
        // تعديل نفس الخزينة
        const treasury = existing.treasury;
        if (!treasury) throw new Error("الخزينة غير موجودة");

        // السماح بالسالب: تمت إزالة شرط الرصيد لزيادة المبلغ

        await tx.treasuries.update({
          where: { id: existing.treasury_id },
          data: { current_balance: { decrement: amountDiff } }, // خصم الفرق
        });
      }

      // 4. سجل حركة خزينة جديدة للتعديل
      if (amountDiff !== 0 && existing.treasury_id) {
        await tx.treasury_transactions.create({
          data: {
            treasury_id: existing.treasury_id,
            direction: amountDiff > 0 ? "out" : "in",
            amount: Math.abs(amountDiff),
            reference_type: "expense_adjustment",
            reference_id: id,
            status: "accepted",
            by_user_id: profile.id,
            notes: `تعديل مصروف - الفرق: ${amountDiff}`,
          },
        });
      }

      return updated;
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: "DB_ERROR", message: e?.message || "حدث خطأ" } }, { status: 500 });
  }
}

// DELETE /api/expenses/[id] - إلغاء مصروف
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });

  try {
    const { id } = await params;
    const expense = await prisma.expenses.findUnique({
      where: { id },
      include: { treasury: true },
    });

    if (!expense) return NextResponse.json({ ok: false, error: { code: "NOT_FOUND" } }, { status: 404 });

    // فقط المنشئ أو admin
    if (expense.created_by !== profile.id && profile.role !== 'admin') {
      return NextResponse.json({ ok: false, error: { code: "FORBIDDEN" } }, { status: 403 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const amount = Number(expense.amount);

      // 1. إرجاع المبلغ للخزينة
      if (expense.treasury_id) {
        await tx.treasuries.update({
          where: { id: expense.treasury_id },
          data: { current_balance: { increment: amount } },
        });
      }

      // 2. سجل حركة عكسية في الخزينة
      if (expense.treasury_id) {
        await tx.treasury_transactions.create({
          data: {
            treasury_id: expense.treasury_id,
            direction: "in",
            amount: amount,
            reference_type: "expense_cancellation",
            reference_id: id,
            status: "accepted",
            by_user_id: profile.id,
            notes: `إلغاء مصروف: ${expense.description}`,
          },
        });
      }

      // 3. حذف المصروف
      await tx.expenses.delete({ where: { id } });

      return { message: "تم إلغاء المصروف وإرجاع المبلغ للخزينة" };
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: "DB_ERROR", message: e?.message || "حدث خطأ" } }, { status: 500 });
  }
}