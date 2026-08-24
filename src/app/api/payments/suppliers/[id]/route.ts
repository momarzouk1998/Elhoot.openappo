import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth-server";

// GET /api/payments/suppliers/[id] - جلب تفاصيل مدفوعة مورد
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });

  try {
    const { id } = await params;
    const payment = await prisma.supplier_payments.findUnique({
      where: { id },
      include: {
        supplier: { select: { id: true, name: true, phone: true } },
        treasury: { select: { id: true, name: true } },
        creator: { select: { id: true, full_name: true } },
        purchase: { select: { id: true, purchase_number: true, total_amount: true } },
      },
    });

    if (!payment) return NextResponse.json({ ok: false, error: { code: "NOT_FOUND" } }, { status: 404 });
    return NextResponse.json({ ok: true, data: payment });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: "DB_ERROR", message: e?.message } }, { status: 500 });
  }
}

// PATCH /api/payments/suppliers/[id] - تعديل مدفوعة مورد
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });

  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.supplier_payments.findUnique({
      where: { id },
      include: { supplier: true, treasury: true, purchase: true },
    });

    if (!existing) return NextResponse.json({ ok: false, error: { code: "NOT_FOUND" } }, { status: 404 });

    // فقط المنشئ أو admin (إذا كان created_by موجود)
    if (existing.created_by && existing.created_by !== profile.id && profile.role !== 'admin') {
      return NextResponse.json({ ok: false, error: { code: "FORBIDDEN" } }, { status: 403 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. احسب الفرق في المبلغ
      const oldAmount = Number(existing.amount);
      const newAmount = Number(body.amount || oldAmount);
      const amountDiff = newAmount - oldAmount;

      // 2. تحديث المدفوعة
      const updated = await tx.supplier_payments.update({
        where: { id },
        data: {
          amount: newAmount,
          payment_method: body.payment_method || existing.payment_method,
          treasury_id: body.treasury_id || existing.treasury_id,
          payment_date: body.payment_date ? new Date(body.payment_date) : existing.payment_date,
          notes: body.notes !== undefined ? body.notes : existing.notes,
          created_by: existing.created_by || profile.id, // إضافة created_by إذا لم يكن موجود
        },
      });

      // 3. تعديل رصيد المورد حسب الفرق
      if (amountDiff !== 0 && existing.supplier_id) {
        await tx.suppliers.update({
          where: { id: existing.supplier_id },
          data: { balance: { decrement: amountDiff } }, // خصم الفرق (لأن زيادة السداد = تقليل المستحقات)
        });
      }

      // 4. تعديل أرصدة الخزائن
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
        const treasury = await tx.treasuries.findUnique({ where: { id: existing.treasury_id } });
        if (!treasury) throw new Error("الخزينة غير موجودة");

        // السماح بالسالب: تمت إزالة شرط الرصيد لزيادة المبلغ

        await tx.treasuries.update({
          where: { id: existing.treasury_id },
          data: { current_balance: { decrement: amountDiff } }, // خصم الفرق
        });
      }

      // 5. تحديث المبلغ المدفوع على فاتورة الشراء
      if (existing.purchase_id && amountDiff !== 0) {
        const purchase = existing.purchase;
        if (purchase) {
          const totalPurchase = Number(purchase.total_amount);
          const currentPaid = Number(purchase.paid_amount || 0);
          const newPaid = Math.min(totalPurchase, Math.max(0, currentPaid + amountDiff));
          
          await tx.purchase_invoices.update({
            where: { id: existing.purchase_id },
            data: { paid_amount: newPaid },
          });
        }
      }

      // 6. سجل حركة خزينة جديدة للتعديل
      if (amountDiff !== 0 && existing.treasury_id) {
        await tx.treasury_transactions.create({
          data: {
            treasury_id: existing.treasury_id,
            direction: amountDiff > 0 ? "out" : "in", // عكس مدفوعات العملاء
            amount: Math.abs(amountDiff),
            reference_type: "supplier_payment_adjustment",
            reference_id: id,
            status: "accepted",
            by_user_id: profile.id,
            notes: `تعديل سداد مورد - الفرق: ${amountDiff}`,
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

// DELETE /api/payments/suppliers/[id] - إلغاء مدفوعة مورد
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });

  try {
    const { id } = await params;
    const payment = await prisma.supplier_payments.findUnique({
      where: { id },
      include: { supplier: true, treasury: true, purchase: true },
    });

    if (!payment) return NextResponse.json({ ok: false, error: { code: "NOT_FOUND" } }, { status: 404 });

    // المصرح لهم: المدير، المحاسب، المنشئ، أو الأدمن
    if (payment.created_by && payment.created_by !== profile.id && !['admin', 'manager', 'accountant'].includes(profile.role)) {
      return NextResponse.json({ ok: false, error: { code: "FORBIDDEN", message: "غير مصرح لك بحذف هذه المدفوعة" } }, { status: 403 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const amount = Number(payment.amount);

      // 1. إرجاع المبلغ لرصيد المورد (زيادة المستحقات)
      if (payment.supplier_id) {
        await tx.suppliers.update({
          where: { id: payment.supplier_id },
          data: { balance: { increment: amount } },
        });
      }

      // 2. إرجاع المبلغ للخزينة
      if (payment.treasury_id) {
        await tx.treasuries.update({
          where: { id: payment.treasury_id },
          data: { current_balance: { increment: amount } },
        });
      }

      // 3. تقليل المبلغ المدفوع من فاتورة الشراء
      if (payment.purchase_id) {
        const purchase = payment.purchase;
        if (purchase) {
          const currentPaid = Number(purchase.paid_amount || 0);
          const newPaid = Math.max(0, currentPaid - amount);
          
          await tx.purchase_invoices.update({
            where: { id: payment.purchase_id },
            data: { paid_amount: newPaid },
          });
        }
      }

      // 4. سجل حركة عكسية في الخزينة
      if (payment.treasury_id) {
        await tx.treasury_transactions.create({
          data: {
            treasury_id: payment.treasury_id,
            direction: "in",
            amount: amount,
            reference_type: "supplier_payment_cancellation",
            reference_id: id,
            status: "accepted",
            by_user_id: profile.id,
            notes: `إلغاء سداد لـ ${payment.supplier?.name || 'مورد'}`,
          },
        });
      }

      // 5. حذف المدفوعة
      await tx.supplier_payments.delete({ where: { id } });

      return { message: "تم إلغاء السداد وإرجاع المبلغ لرصيد المورد والخزينة" };
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: "DB_ERROR", message: e?.message || "حدث خطأ" } }, { status: 500 });
  }
}