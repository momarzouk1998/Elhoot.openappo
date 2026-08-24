import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth-server";
import { FinancialNotifications } from "@/lib/financial-notifications";
import { AuditLog } from "@/lib/audit-log";

// GET /api/payments/customers/[id] - جلب تفاصيل مدفوعة عميل
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });

  try {
    const { id } = await params;
    const payment = await prisma.customer_payments.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        treasury: { select: { id: true, name: true } },
        creator: { select: { id: true, full_name: true } },
        invoice: { select: { id: true, invoice_number: true, total: true } },
      },
    });

    if (!payment) return NextResponse.json({ ok: false, error: { code: "NOT_FOUND" } }, { status: 404 });
    return NextResponse.json({ ok: true, data: payment });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: "DB_ERROR", message: e?.message } }, { status: 500 });
  }
}

// PATCH /api/payments/customers/[id] - تعديل مدفوعة عميل
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });

  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.customer_payments.findUnique({
      where: { id },
      include: { customer: true, treasury: true, invoice: true },
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

      // 2. تحديث المدفوعة
      const updated = await tx.customer_payments.update({
        where: { id },
        data: {
          amount: newAmount,
          payment_method: body.payment_method || existing.payment_method,
          treasury_id: body.treasury_id || existing.treasury_id,
          payment_date: body.payment_date ? new Date(body.payment_date) : existing.payment_date,
          notes: body.notes !== undefined ? body.notes : existing.notes,
        },
      });

      // 3. تعديل رصيد العميل حسب الفرق
      if (amountDiff !== 0 && existing.customer_id) {
        await tx.customers.update({
          where: { id: existing.customer_id },
          data: { balance: { decrement: amountDiff } }, // خصم الفرق (لأن زيادة التحصيل = تقليل الرصيد)
        });
      }

      // 4. تعديل أرصدة الخزائن
      if (body.treasury_id && body.treasury_id !== existing.treasury_id) {
        // نقل من خزينة لأخرى
        if (existing.treasury_id) {
          await tx.treasuries.update({
            where: { id: existing.treasury_id },
            data: { current_balance: { decrement: oldAmount } },
          });
        }
        await tx.treasuries.update({
          where: { id: body.treasury_id },
          data: { current_balance: { increment: newAmount } },
        });
      } else if (amountDiff !== 0 && existing.treasury_id) {
        // تعديل نفس الخزينة
        await tx.treasuries.update({
          where: { id: existing.treasury_id },
          data: { current_balance: { increment: amountDiff } },
        });
      }

      // 5. إعادة حساب المبلغ المدفوع والرصيد الجديد على الفاتورة من سندات التحصيل الفعلية
      if (existing.invoice_id) {
        const allPaid = await tx.customer_payments.aggregate({
          where: { invoice_id: existing.invoice_id },
          _sum: { amount: true },
        });
        const invoiceTotal = Number(existing.invoice?.total || 0);
        const newPaid = Math.min(invoiceTotal, Number(allPaid._sum.amount || 0));
        const updatedNewBal = existing.invoice?.customer_prev_balance !== null && existing.invoice?.customer_prev_balance !== undefined
          ? Number(existing.invoice.customer_prev_balance) + invoiceTotal - newPaid
          : null;
        await tx.sales_invoices.update({
          where: { id: existing.invoice_id },
          data: {
            paid_amount: newPaid,
            ...(updatedNewBal !== null ? { customer_new_balance: updatedNewBal } : {}),
          },
        });
      }

      // 6. سجل حركة خزينة جديدة للتعديل
      if (amountDiff !== 0 && existing.treasury_id) {
        await tx.treasury_transactions.create({
          data: {
            treasury_id: existing.treasury_id,
            direction: amountDiff > 0 ? "in" : "out",
            amount: Math.abs(amountDiff),
            reference_type: "customer_payment_adjustment",
            reference_id: id,
            status: "accepted",
            by_user_id: profile.id,
            notes: `تعديل تحصيل - الفرق: ${amountDiff}`,
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

// DELETE /api/payments/customers/[id] - إلغاء مدفوعة عميل
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });

  try {
    const { id } = await params;
    const payment = await prisma.customer_payments.findUnique({
      where: { id },
      include: { customer: true, treasury: true, invoice: true },
    });

    if (!payment) return NextResponse.json({ ok: false, error: { code: "NOT_FOUND" } }, { status: 404 });

    // المصرح لهم: المدير، المحاسب، المنشئ، أو الأدمن
    if (payment.created_by && payment.created_by !== profile.id && !['admin', 'manager', 'accountant'].includes(profile.role)) {
      return NextResponse.json({ ok: false, error: { code: "FORBIDDEN", message: "غير مصرح لك بحذف هذه المدفوعة" } }, { status: 403 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const amount = Number(payment.amount);

      // 1. إرجاع المبلغ لرصيد العميل
      if (payment.customer_id) {
        await tx.customers.update({
          where: { id: payment.customer_id },
          data: { balance: { increment: amount } },
        });
      }

      // 2. خصم المبلغ من الخزينة
      if (payment.treasury_id) {
        const treasury = await tx.treasuries.findUnique({ where: { id: payment.treasury_id } });
        if (!treasury) throw new Error("الخزينة غير موجودة");
        
        // السماح بالسالب: تمت إزالة شرط رصيد الخزينة لإلغاء التحصيل

        await tx.treasuries.update({
          where: { id: payment.treasury_id },
          data: { current_balance: { decrement: amount } },
        });
      }

      // 3. إعادة حساب المبلغ المدفوع والرصيد الجديد على الفاتورة من سندات التحصيل الفعلية
      if (payment.invoice_id) {
        const remaining = await tx.customer_payments.aggregate({
          where: { invoice_id: payment.invoice_id, id: { not: id } },
          _sum: { amount: true },
        });
        const invoiceTotal = Number(payment.invoice?.total || 0);
        const newPaid = Math.min(
          invoiceTotal,
          Number(remaining._sum.amount || 0)
        );
        const updatedNewBal = payment.invoice?.customer_prev_balance !== null && payment.invoice?.customer_prev_balance !== undefined
          ? Number(payment.invoice.customer_prev_balance) + invoiceTotal - newPaid
          : null;
        await tx.sales_invoices.update({
          where: { id: payment.invoice_id },
          data: {
            paid_amount: newPaid,
            ...(updatedNewBal !== null ? { customer_new_balance: updatedNewBal } : {}),
          },
        });
      }

      // 4. سجل حركة عكسية في الخزينة
      if (payment.treasury_id) {
        await tx.treasury_transactions.create({
          data: {
            treasury_id: payment.treasury_id,
            direction: "out",
            amount: amount,
            reference_type: "customer_payment_cancellation",
            reference_id: id,
            status: "accepted",
            by_user_id: profile.id,
            notes: `إلغاء تحصيل من ${payment.customer?.name || 'عميل'}`,
          },
        });
      }

      // 5. حذف المدفوعة
      await tx.customer_payments.delete({ where: { id } });

      // 6. إشعار بالحذف
      FinancialNotifications.paymentDeleted(amount, payment.customer?.name || 'غير معروف', profile.id);

      // 7. سجل تدقيق
      await AuditLog.customerPaymentDeleted(profile.id, id, {
        amount,
        customer_name: payment.customer?.name,
        treasury_name: payment.treasury?.name,
        payment_method: payment.payment_method,
        payment_date: payment.payment_date,
      });

      return { message: "تم إلغاء التحصيل وإرجاع المبلغ لرصيد العميل" };
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: "DB_ERROR", message: e?.message || "حدث خطأ" } }, { status: 500 });
  }
}