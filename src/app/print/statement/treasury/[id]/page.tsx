import prisma from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import { formatEGP, formatDate } from "@/lib/format";
import PrintActions from "@/app/print/invoice/[id]/PrintActions";
import { LOGO_BASE64 } from "@/lib/logo-base64";

export const dynamic = "force-dynamic";

export default async function TreasuryStatementPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from_date?: string; to_date?: string; type?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const fromDate = sp.from_date || "";
  const toDate = sp.to_date || "";
  const typeFilter = sp.type || "all";

  const treasury = await prisma.treasuries.findUnique({
    where: { id },
  });

  if (!treasury || !treasury.is_active) notFound();

  let assignedUserName: string | null = null;
  if (treasury.assigned_user_id) {
    const u = await prisma.users.findUnique({
      where: { id: treasury.assigned_user_id },
      select: { full_name: true },
    });
    assignedUserName = u?.full_name || null;
  }

  // جلب كافة الحركات
  const [
    custPayments,
    suppPayments,
    expensesList,
    directTransactions,
  ] = await Promise.all([
    prisma.customer_payments.findMany({
      where: { treasury_id: id },
      orderBy: { payment_date: "asc" },
      include: { customer: { select: { name: true } }, creator: { select: { full_name: true } } },
    }),
    prisma.supplier_payments.findMany({
      where: { treasury_id: id },
      orderBy: { payment_date: "asc" },
      include: { supplier: { select: { name: true } }, creator: { select: { full_name: true } } },
    }),
    prisma.expenses.findMany({
      where: { treasury_id: id },
      orderBy: { expense_date: "asc" },
      include: { creator: { select: { full_name: true } } },
    }),
    prisma.treasury_transactions.findMany({
      where: {
        treasury_id: id,
        reference_type: { notIn: ["customer_payment", "supplier_payment", "expense"] },
      },
      orderBy: { transaction_date: "asc" },
      include: { by_user: { select: { full_name: true } } },
    }),
  ]);

  type StatementEvent = {
    id: string;
    date: Date;
    type: "in" | "out";
    category: string;
    label: string;
    amountIn: number;
    amountOut: number;
    notes?: string | null;
    user?: string | null;
  };

  const allEvents: StatementEvent[] = [];

  for (const cp of custPayments) {
    allEvents.push({
      id: "cp-" + cp.id,
      date: new Date(cp.payment_date),
      type: "in",
      category: "تحصيل عميل",
      label: "تحصيل من عميل: " + (cp.customer?.name || "عميل نقدي"),
      amountIn: Number(cp.amount || 0),
      amountOut: 0,
      notes: cp.notes,
      user: cp.creator?.full_name,
    });
  }

  for (const sp of suppPayments) {
    allEvents.push({
      id: "sp-" + sp.id,
      date: new Date(sp.payment_date),
      type: "out",
      category: "سداد مورد",
      label: "سداد للمورد: " + (sp.supplier?.name || ""),
      amountIn: 0,
      amountOut: Number(sp.amount || 0),
      notes: sp.notes,
      user: sp.creator?.full_name,
    });
  }

  for (const exp of expensesList) {
    allEvents.push({
      id: "exp-" + exp.id,
      date: new Date(exp.expense_date),
      type: "out",
      category: "مصروف: " + exp.category,
      label: "مصروفات - " + exp.category + (exp.description ? " (" + exp.description + ")" : ""),
      amountIn: 0,
      amountOut: Number(exp.amount || 0),
      notes: exp.notes,
      user: exp.creator?.full_name,
    });
  }

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
      amountIn: isIn ? amt : 0,
      amountOut: !isIn ? amt : 0,
      notes: tx.notes,
      user: tx.by_user?.full_name,
    });
  }

  allEvents.sort((a, b) => a.date.getTime() - b.date.getTime());

  let running = Number(treasury.opening_balance || 0);
  type StatementItem = StatementEvent & {
    balance: number;
  };

  const calculatedItems: StatementItem[] = [];
  for (const ev of allEvents) {
    if (ev.type === "in") {
      running += ev.amountIn;
    } else {
      running -= ev.amountOut;
    }
    calculatedItems.push({
      ...ev,
      balance: running,
    });
  }

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

  const periodIn = filteredItems.filter((it) => it.type === "in").reduce((s, it) => s + it.amountIn, 0);
  const periodOut = filteredItems.filter((it) => it.type === "out").reduce((s, it) => s + it.amountOut, 0);
  const periodNet = periodIn - periodOut;

  const fPeriod = fromDate || toDate ? `من ${fromDate || "البداية"} إلى ${toDate || "الآن"}` : "كامل الفترة";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        padding: "1rem",
        fontFamily: "'Cairo', 'Segoe UI', sans-serif",
        direction: "rtl",
      }}
    >
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
          body {
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
            direction: rtl !important;
          }
          .no-print {
            display: none !important;
          }
          #statement-page {
            width: 100% !important;
            max-width: 100% !important;
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          table {
            width: 100% !important;
            border-collapse: collapse !important;
          }
          th, td {
            border: 1px solid #cbd5e1 !important;
          }
          tr {
            page-break-inside: avoid !important;
          }
        }
      `}</style>

      <PrintActions
        backLink={`/treasury/${id}`}
        backLabel="↩️ العودة لكشف الخزينة"
        fileName={`كشف حساب خزينة - ${treasury.name}`}
        targetId="statement-page"
        title="كشف حساب الخزينة والمعاملات النقدية"
      />

      <div
        id="statement-page"
        className="max-w-4xl mx-auto bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200 mt-4 text-slate-800"
      >
        {/* Header */}
        <div className="flex justify-between items-start border-b-2 border-slate-900 pb-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl border-2 border-blue-600 p-1 flex items-center justify-center bg-white shadow-sm">
              <img src={LOGO_BASE64} alt="شركة الحوت" className="max-h-full max-w-full object-contain" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900">شركة الحوت للأدوات واللوحات الكهربائية</h1>
              <p className="text-xs text-slate-500 font-bold">تجارة وتوزيع الأدوات والمهمات واللوحات الكهربائية بالجملة</p>
              <p className="text-xs text-slate-600 mt-1">
                🏦 <strong className="text-slate-900">كشف حساب ومعاملات الخزينة</strong>
              </p>
            </div>
          </div>

          <div className="text-left space-y-1">
            <div className="inline-block px-3 py-1 rounded-lg bg-blue-900 text-white text-xs font-black">
              كشف حركات الخزينة
            </div>
            <div className="text-xs text-slate-600 font-mono">
              تاريخ الطباعة: {new Date().toLocaleDateString("ar-EG")}
            </div>
            <div className="text-xs text-slate-500">الفترة: {fPeriod}</div>
          </div>
        </div>

        {/* Treasury Info Box */}
        <div className="grid grid-cols-3 gap-4 mb-6 text-sm">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-xs text-slate-500 font-bold block mb-0.5">اسم الخزينة / العهدة:</span>
            <strong className="text-slate-900 text-base">{treasury.name}</strong>
            <span className="text-xs text-slate-500 block">النوع: {treasury.type}</span>
            {assignedUserName && (
              <div className="text-xs text-blue-700 font-bold mt-1">👤 المسئول: {assignedUserName}</div>
            )}
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-xs text-slate-500 font-bold block mb-0.5">الرصيد الافتتاحي:</span>
            <span className="font-black text-slate-900 text-base font-mono">
              {formatEGP(Number(treasury.opening_balance || 0))} ج.م
            </span>
          </div>

          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
            <span className="text-xs text-emerald-800 font-bold block mb-0.5">الرصيد الحالي بالخزينة:</span>
            <span className="font-black text-emerald-700 text-lg font-mono">
              {formatEGP(Number(treasury.current_balance || 0))} ج.م
            </span>
          </div>
        </div>

        {/* Period Summary Bar */}
        <div className="flex items-center justify-between p-3.5 bg-slate-100 rounded-xl border border-slate-200 text-xs font-bold mb-6 flex-wrap gap-2">
          <span>
            🟢 إجمالي الوارد (+): <strong className="text-emerald-700 font-mono">+{formatEGP(periodIn)} ج</strong>
          </span>
          <span>
            🔴 إجمالي المنصرف (-): <strong className="text-rose-700 font-mono">-{formatEGP(periodOut)} ج</strong>
          </span>
          <span>
            ⚖️ صافي الفترة:{" "}
            <strong className={periodNet >= 0 ? "text-emerald-700 font-mono" : "text-rose-700 font-mono"}>
              {periodNet >= 0 ? "+" : ""}
              {formatEGP(periodNet)} ج
            </strong>
          </span>
          <span>
            📊 عدد الحركات: <strong className="text-slate-900 font-mono">{filteredItems.length}</strong>
          </span>
        </div>

        {/* Statement Table */}
        <table className="w-full text-xs text-right border-collapse mb-8 border border-slate-300">
          <thead>
            <tr className="bg-slate-900 text-white font-bold">
              <th className="p-2 border border-slate-700 text-center w-8">#</th>
              <th className="p-2 border border-slate-700 w-24">التاريخ</th>
              <th className="p-2 border border-slate-700 w-28">نوع الحركة</th>
              <th className="p-2 border border-slate-700">البيان والتفاصيل</th>
              <th className="p-2 border border-slate-700 text-center w-24 text-emerald-300">وارد (+)</th>
              <th className="p-2 border border-slate-700 text-center w-24 text-rose-300">منصرف (-)</th>
              <th className="p-2 border border-slate-700 text-center w-28 bg-slate-800">الرصيد</th>
              <th className="p-2 border border-slate-700 text-center w-20">المستخدم</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-slate-400 font-bold">
                  لا توجد حركات مسجلة لهذه الخزينة خلال الفترة المحددة
                </td>
              </tr>
            ) : (
              filteredItems.map((item, idx) => {
                return (
                  <tr
                    key={item.id}
                    className={`border-b border-slate-200 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/70"}`}
                  >
                    <td className="p-2 border border-slate-200 text-center text-slate-400 font-mono">{idx + 1}</td>
                    <td className="p-2 border border-slate-200 whitespace-nowrap font-medium text-slate-700">
                      {item.date ? formatDate(item.date) : "—"}
                    </td>
                    <td className="p-2 border border-slate-200 whitespace-nowrap font-bold text-[11px]">
                      {item.category}
                    </td>
                    <td className="p-2 border border-slate-200">
                      <div className="font-bold text-slate-900">{item.label}</div>
                      {item.notes && item.notes !== item.label && (
                        <div className="text-[10px] text-slate-500 font-normal">{item.notes}</div>
                      )}
                    </td>
                    <td className="p-2 border border-slate-200 font-mono text-emerald-700 text-center whitespace-nowrap">
                      {item.amountIn > 0 ? `+${formatEGP(item.amountIn)}` : "—"}
                    </td>
                    <td className="p-2 border border-slate-200 font-mono text-rose-700 text-center whitespace-nowrap">
                      {item.amountOut > 0 ? `-${formatEGP(item.amountOut)}` : "—"}
                    </td>
                    <td className="p-2 border border-slate-200 font-mono font-black text-slate-900 text-center whitespace-nowrap bg-slate-100/50">
                      {formatEGP(item.balance)} ج
                    </td>
                    <td className="p-2 border border-slate-200 text-center text-[10px] text-slate-500 whitespace-nowrap">
                      {item.user || "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {filteredItems.length > 0 && (
            <tfoot>
              <tr className="bg-slate-200 font-black border-t-2 border-slate-400 text-slate-900">
                <td colSpan={4} className="p-2.5 border border-slate-400 text-left">
                  الإجمالي:
                </td>
                <td className="p-2.5 border border-slate-400 text-center font-mono text-emerald-800">
                  +{formatEGP(periodIn)}
                </td>
                <td className="p-2.5 border border-slate-400 text-center font-mono text-rose-800">
                  -{formatEGP(periodOut)}
                </td>
                <td className="p-2.5 border border-slate-400 text-center font-mono text-slate-900">
                  {formatEGP(Number(treasury.current_balance || 0))} ج
                </td>
                <td className="border border-slate-400"></td>
              </tr>
            </tfoot>
          )}
        </table>

        {/* Signatures Footer */}
        <div className="grid grid-cols-3 gap-4 pt-12 text-center text-xs font-bold text-slate-700 mt-8 border-t border-slate-200">
          <div>
            <div className="mb-8 text-slate-500">أمين الخزينة / العهدة</div>
            <div className="border-t border-slate-400 w-32 mx-auto pt-1 font-mono">....................</div>
          </div>
          <div>
            <div className="mb-8 text-slate-500">المراجع المالي / المحاسب</div>
            <div className="border-t border-slate-400 w-32 mx-auto pt-1 font-mono">....................</div>
          </div>
          <div>
            <div className="mb-8 text-slate-500">اعتماد الإدارة</div>
            <div className="border-t border-slate-400 w-32 mx-auto pt-1 font-mono">....................</div>
          </div>
        </div>

        {/* Footer Note */}
        <div className="text-center text-[10px] text-slate-400 pt-6 mt-6 border-t border-slate-100">
          شركة الحوت للأدوات واللوحات الكهربائية ▪ نظام إدارة وتوزيع الحسابات والمخازن الإلكتروني
        </div>
      </div>
    </div>
  );
}
