import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth-server";

// GET /api/treasury/[id]/statement — كشف حساب تفصيلي للخزينة مع كافة الحركات والرصيد التراكمي
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentUser();
  if (!profile) {
    return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "غير مسجل الدخول" } }, { status: 401 });
  }

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const fromDate = searchParams.get("from_date");
    const toDate = searchParams.get("to_date");
    const search = (searchParams.get("search") || "").trim().toLowerCase();
    const typeFilter = searchParams.get("type") || "all"; // all | in | out

    const treasury = await prisma.treasuries.findUnique({
      where: { id },
    });

    if (!treasury) {
      return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "الخزينة غير موجودة" } }, { status: 404 });
    }

    let assignedUserName: string | null = null;
    if (treasury.assigned_user_id) {
      const u = await prisma.users.findUnique({
        where: { id: treasury.assigned_user_id },
        select: { full_name: true },
      });
      assignedUserName = u?.full_name || null;
    }

    // جلب كافة حركات الخزينة من جميع الجداول المرتبطة
    const [
      custPayments,
      suppPayments,
      expensesList,
      directTransactions,
    ] = await Promise.all([
      // 1. تحصيلات العملاء (+)
      prisma.customer_payments.findMany({
        where: { treasury_id: id },
        orderBy: { payment_date: "asc" },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          creator: { select: { id: true, full_name: true } },
        },
      }),
      // 2. مدفوعات الموردين (-)
      prisma.supplier_payments.findMany({
        where: { treasury_id: id },
        orderBy: { payment_date: "asc" },
        include: {
          supplier: { select: { id: true, name: true, phone: true } },
          creator: { select: { id: true, full_name: true } },
        },
      }),
      // 3. المصروفات النقدية (-)
      prisma.expenses.findMany({
        where: { treasury_id: id },
        orderBy: { expense_date: "asc" },
        include: {
          creator: { select: { id: true, full_name: true } },
        },
      }),
      // 4. الحركات النقدية المباشرة والتحويلات (+ / -)
      prisma.treasury_transactions.findMany({
        where: {
          treasury_id: id,
          reference_type: { notIn: ["customer_payment", "supplier_payment", "expense"] },
        },
        orderBy: { transaction_date: "asc" },
        include: {
          by_user: { select: { id: true, full_name: true } },
        },
      }),
    ]);

    type StatementEvent = {
      id: string;
      date: Date;
      type: "in" | "out";
      category: string;
      label: string;
      party?: string | null;
      amountIn: number;
      amountOut: number;
      notes?: string | null;
      user?: string | null;
      refId?: string | null;
    };

    const allEvents: StatementEvent[] = [];

    // 1. تحصيلات عملاء (+)
    for (const cp of custPayments) {
      allEvents.push({
        id: "cp-" + cp.id,
        date: new Date(cp.payment_date),
        type: "in",
        category: "تحصيل عميل",
        label: "تحصيل من عميل: " + (cp.customer?.name || "عميل نقدي"),
        party: cp.customer?.name,
        amountIn: Number(cp.amount || 0),
        amountOut: 0,
        notes: cp.notes || ("طريقة الدفع: " + (cp.payment_method || "نقدي")),
        user: cp.creator?.full_name,
        refId: cp.id,
      });
    }

    // 2. مدفوعات موردين (-)
    for (const sp of suppPayments) {
      allEvents.push({
        id: "sp-" + sp.id,
        date: new Date(sp.payment_date),
        type: "out",
        category: "سداد مورد",
        label: "سداد للمورد: " + (sp.supplier?.name || ""),
        party: sp.supplier?.name,
        amountIn: 0,
        amountOut: Number(sp.amount || 0),
        notes: sp.notes || ("طريقة السداد: " + (sp.payment_method || "نقدي")),
        user: sp.creator?.full_name,
        refId: sp.id,
      });
    }

    // 3. المصروفات (-)
    for (const exp of expensesList) {
      allEvents.push({
        id: "exp-" + exp.id,
        date: new Date(exp.expense_date),
        type: "out",
        category: "مصروف: " + exp.category,
        label: "مصروفات - " + exp.category + (exp.description ? " (" + exp.description + ")" : ""),
        party: exp.category,
        amountIn: 0,
        amountOut: Number(exp.amount || 0),
        notes: exp.notes,
        user: exp.creator?.full_name,
        refId: exp.id,
      });
    }

    // 4. الحركات المباشرة والتحويلات (+ / -)
    for (const tx of directTransactions) {
      const isIn = tx.direction === "in" || tx.direction === "transfer_in";
      const amt = Number(tx.amount || 0);
      let cat = "حركة نقدية";
      let lbl = tx.notes || "حركة نقدية مباشرة";

      if (tx.reference_type === "direct_deposit") {
        cat = "إيداع نقدي مباشر";
        lbl = tx.notes || "إيداع نقدي حر في الخزينة";
      } else if (tx.reference_type === "direct_withdrawal") {
        cat = "سحب نقدي مباشر";
        lbl = tx.notes || "سحب نقدي حر من الخزينة";
      } else if (tx.reference_type === "transfer") {
        cat = isIn ? "تحويل وارد" : "تحويل صادر";
        lbl = tx.notes || (isIn ? "تحويل وارد من خزينة أخرى" : "تحويل صادر إلى خزينة أخرى");
      }

      allEvents.push({
        id: "tx-" + tx.id,
        date: new Date(tx.transaction_date),
        type: isIn ? "in" : "out",
        category: cat,
        label: lbl,
        party: null,
        amountIn: isIn ? amt : 0,
        amountOut: !isIn ? amt : 0,
        notes: tx.notes,
        user: tx.by_user?.full_name,
        refId: tx.id,
      });
    }

    // ترتيب الحركات زمنياً تصاعدياً لحساب الرصيد التراكمي
    allEvents.sort((a, b) => a.date.getTime() - b.date.getTime());

    // احتساب الرصيد التراكمي الشامل لكل حركة
    let runningBalance = Number(treasury.opening_balance || 0);
    type StatementItem = StatementEvent & {
      balance: number;
    };

    const calculatedItems: StatementItem[] = [];
    let totalIn = 0;
    let totalOut = 0;

    for (const ev of allEvents) {
      if (ev.type === "in") {
        runningBalance += ev.amountIn;
        totalIn += ev.amountIn;
      } else {
        runningBalance -= ev.amountOut;
        totalOut += ev.amountOut;
      }

      calculatedItems.push({
        ...ev,
        balance: runningBalance,
      });
    }

    // تطبيق الفلاتر (البحث، التواريخ، النوع)
    let filteredItems = calculatedItems;

    if (fromDate) {
      const fDate = new Date(fromDate);
      fDate.setHours(0, 0, 0, 0);
      filteredItems = filteredItems.filter((it) => it.date >= fDate);
    }

    if (toDate) {
      const tDate = new Date(toDate);
      tDate.setHours(23, 59, 59, 999);
      filteredItems = filteredItems.filter((it) => it.date <= tDate);
    }

    if (typeFilter === "in") {
      filteredItems = filteredItems.filter((it) => it.type === "in");
    } else if (typeFilter === "out") {
      filteredItems = filteredItems.filter((it) => it.type === "out");
    }

    if (search) {
      filteredItems = filteredItems.filter(
        (it) =>
          it.label.toLowerCase().includes(search) ||
          (it.party && it.party.toLowerCase().includes(search)) ||
          it.category.toLowerCase().includes(search) ||
          (it.notes && it.notes.toLowerCase().includes(search)) ||
          (it.user && it.user.toLowerCase().includes(search))
      );
    }

    // إجماليات الفترة المحددة
    const periodIn = filteredItems.filter((it) => it.type === "in").reduce((s, it) => s + it.amountIn, 0);
    const periodOut = filteredItems.filter((it) => it.type === "out").reduce((s, it) => s + it.amountOut, 0);
    const periodNet = periodIn - periodOut;

    return NextResponse.json({
      ok: true,
      data: {
        treasury: {
          id: treasury.id,
          name: treasury.name,
          type: treasury.type,
          opening_balance: Number(treasury.opening_balance || 0),
          current_balance: Number(treasury.current_balance || 0),
          calculated_balance: runningBalance,
          assigned_user: assignedUserName,
          notes: treasury.notes,
        },
        summary: {
          opening_balance: Number(treasury.opening_balance || 0),
          total_in: totalIn,
          total_out: totalOut,
          current_balance: Number(treasury.current_balance || 0),
          calculated_balance: runningBalance,
          period_in: periodIn,
          period_out: periodOut,
          period_net: periodNet,
          movement_count: filteredItems.length,
          total_count: calculatedItems.length,
        },
        items: filteredItems.map((it) => ({
          ...it,
          date: it.date.toISOString(),
        })),
      },
    });
  } catch (e: any) {
    console.error("Error generating treasury statement:", e);
    return NextResponse.json({ ok: false, error: { code: "DB_ERROR", message: e?.message || "حدث خطأ أثناء إعداد كشف الخزينة" } }, { status: 500 });
  }
}
