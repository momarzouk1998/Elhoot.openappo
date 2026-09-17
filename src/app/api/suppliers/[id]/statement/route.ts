import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth-server";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });

  try {
    const { id } = await params;

    const [supplier, invoices, payments, returns] = await Promise.all([
      prisma.suppliers.findUnique({ where: { id } }),

      prisma.purchase_invoices.findMany({
        where: { supplier_id: id, status: { not: "ملغاة" } },
        orderBy: { purchase_date: "asc" },
        select: {
          id: true,
          purchase_number: true,
          purchase_date: true,
          total_amount: true,
          status: true,
          notes: true,
          items: {
            select: { product_name: true, quantity: true, unit_cost: true, line_total: true },
          },
        },
      }),

      prisma.supplier_payments.findMany({
        where: { supplier_id: id },
        orderBy: { payment_date: "asc" },
        select: {
          id: true,
          payment_date: true,
          amount: true,
          payment_method: true,
          notes: true,
          treasury: { select: { id: true, name: true } },
          creator: { select: { id: true, full_name: true } },
        },
      }),

      prisma.supplier_return_invoices.findMany({
        where: { supplier_id: id, status: { not: "ملغاة" } },
        orderBy: { return_date: "asc" },
        select: {
          id: true,
          return_number: true,
          return_date: true,
          total_amount: true,
          notes: true,
          items: {
            select: { product_name: true, quantity: true, unit_cost: true, line_total: true },
          },
        },
      }),
    ]);

    if (!supplier) {
      return NextResponse.json({ ok: false, error: { code: "NOT_FOUND" } }, { status: 404 });
    }

    let running = Number(supplier.opening_balance || 0);
    let totalDebit = 0;
    let totalCredit = 0;
    const entries: any[] = [];

    if (Number(supplier.opening_balance || 0) !== 0) {
      const op = Number(supplier.opening_balance);
      const isDebit = op > 0;
      if (isDebit) totalDebit += op; else totalCredit += Math.abs(op);
      entries.push({
        id: "opening",
        date: "1970-01-01",
        type: "opening",
        label: "رصيد افتتاحي",
        ref: "—",
        debit: isDebit ? op : 0,
        credit: !isDebit ? Math.abs(op) : 0,
        balance: running,
      });
    }

    const allEvents: { date: Date; type: "invoice" | "payment" | "return"; data: any }[] = [
      ...invoices.map((i) => ({ date: new Date(i.purchase_date), type: "invoice" as const, data: i })),
      ...payments.map((p) => ({ date: new Date(p.payment_date), type: "payment" as const, data: p })),
      ...returns.map((r) => ({ date: new Date(r.return_date), type: "return" as const, data: r })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    for (const ev of allEvents) {
      if (ev.type === "invoice") {
        const amt = Number(ev.data.total_amount);
        running += amt;
        totalDebit += amt;
        entries.push({
          id: ev.data.id,
          date: ev.date.toISOString(),
          type: "invoice",
          label: "فاتورة مشتريات",
          ref: `#${ev.data.purchase_number}`,
          debit: amt,
          credit: 0,
          balance: running,
          notes: ev.data.notes,
          items: (ev.data.items || []).map((it: any) => ({
            product_name: it.product_name,
            quantity: Number(it.quantity),
            unit_cost: Number(it.unit_cost),
            line_total: Number(it.line_total),
          })),
        });
      } else if (ev.type === "payment") {
        const amt = Number(ev.data.amount);
        running -= amt;
        totalCredit += amt;
        entries.push({
          id: ev.data.id,
          date: ev.date.toISOString(),
          type: "payment",
          label: ev.data.notes || "سداد للمورد",
          ref: ev.data.payment_method,
          debit: 0,
          credit: amt,
          balance: running,
          payment_method: ev.data.payment_method,
          treasury_name: ev.data.treasury?.name || null,
          creator_name: ev.data.creator?.full_name || null,
          notes: ev.data.notes,
        });
      } else if (ev.type === "return") {
        const amt = Number(ev.data.total_amount);
        running -= amt;
        totalCredit += amt;
        entries.push({
          id: ev.data.id,
          date: ev.date.toISOString(),
          type: "return",
          label: "مرتجع للمورد",
          ref: `↩️ #${ev.data.return_number}`,
          debit: 0,
          credit: amt,
          balance: running,
          notes: ev.data.notes,
          items: (ev.data.items || []).map((it: any) => ({
            product_name: it.product_name,
            quantity: Number(it.quantity),
            unit_cost: Number(it.unit_cost),
            line_total: Number(it.line_total),
          })),
        });
      }
    }

    const totalPurchases = invoices.reduce((s, inv) => s + Number(inv.total_amount), 0);
    const totalReturns = returns.reduce((s, r) => s + Number(r.total_amount), 0);
    const totalPaymentsSum = payments.reduce((s, p) => s + Number(p.amount), 0);

    return NextResponse.json({
      ok: true,
      data: {
        supplier,
        entries,
        totalDebit,
        totalCredit,
        totalPurchases,
        totalReturns,
        totalPayments: totalPaymentsSum,
        finalBalance: running,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: "DB_ERROR", message: e?.message } }, { status: 500 });
  }
}
