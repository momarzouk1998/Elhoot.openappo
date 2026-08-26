import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth-server";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });

  try {
    const { id } = await params;

    const [customer, invoices, payments, returns] = await Promise.all([
      prisma.customers.findUnique({ where: { id } }),

      prisma.sales_invoices.findMany({
        where: { customer_id: id, status: { not: "ملغاة" } },
        orderBy: { invoice_date: "asc" },
        select: {
          id: true,
          invoice_number: true,
          invoice_date: true,
          total: true,
          discount: true,
          subtotal: true,
          status: true,
          items: {
            select: { product_name: true, quantity: true, unit_price: true, line_total: true },
          },
        },
      }),

      prisma.customer_payments.findMany({
        where: { customer_id: id },
        orderBy: { payment_date: "asc" },
        select: { id: true, payment_date: true, amount: true, payment_method: true, notes: true },
      }),

      prisma.customer_return_invoices.findMany({
        where: { customer_id: id, status: { not: "ملغاة" } },
        orderBy: { return_date: "asc" },
        select: {
          id: true,
          return_number: true,
          return_date: true,
          total_amount: true,
          items: {
            select: { product_name: true, quantity: true, unit_price: true, line_total: true },
          },
        },
      }),
    ]);

    if (!customer) {
      return NextResponse.json({ ok: false, error: { code: "NOT_FOUND" } }, { status: 404 });
    }

    let running = Number(customer.opening_balance || 0);
    let totalDebit = 0;
    let totalCredit = 0;
    const entries: any[] = [];

    if (Number(customer.opening_balance || 0) !== 0) {
      const op = Number(customer.opening_balance);
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
      ...invoices.map((i) => ({ date: new Date(i.invoice_date), type: "invoice" as const, data: i })),
      ...payments.map((p) => ({ date: new Date(p.payment_date), type: "payment" as const, data: p })),
      ...returns.map((r) => ({ date: new Date(r.return_date), type: "return" as const, data: r })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    for (const ev of allEvents) {
      if (ev.type === "invoice") {
        const amt = Number(ev.data.total);
        running += amt;
        totalDebit += amt;
        entries.push({
          id: ev.data.id,
          date: ev.date.toISOString(),
          type: "invoice",
          label: "فاتورة مبيعات",
          ref: `#${ev.data.invoice_number}`,
          debit: amt,
          credit: 0,
          balance: running,
          items: ev.data.items,
        });
      } else if (ev.type === "payment") {
        const amt = Number(ev.data.amount);
        running -= amt;
        totalCredit += amt;
        entries.push({
          id: ev.data.id,
          date: ev.date.toISOString(),
          type: "payment",
          label: `تحصيل (${ev.data.payment_method})`,
          ref: ev.data.notes || "تحصيل نقدية",
          debit: 0,
          credit: amt,
          balance: running,
        });
      } else if (ev.type === "return") {
        const amt = Number(ev.data.total_amount);
        running -= amt;
        totalCredit += amt;
        entries.push({
          id: ev.data.id,
          date: ev.date.toISOString(),
          type: "return",
          label: "مرتجع مبيعات",
          ref: `#${ev.data.return_number}`,
          debit: 0,
          credit: amt,
          balance: running,
          items: ev.data.items,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        customer,
        entries,
        totalDebit,
        totalCredit,
        finalBalance: running,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: "DB_ERROR", message: e?.message } }, { status: 500 });
  }
}
