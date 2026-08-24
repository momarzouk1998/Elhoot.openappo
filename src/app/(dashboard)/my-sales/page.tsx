import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-server";
import prisma from "@/lib/db/prisma";
import { formatEGP } from "@/lib/format";

export default async function MySalesPage() {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const invoices = await prisma.sales_invoices.findMany({
    where: { created_by: profile.id },
    include: { customer: true, store: true },
    orderBy: { invoice_date: "desc" },
    take: 100,
  });

  const total = invoices.reduce((sum, inv) => sum + Number(inv.total), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-650">🛒 فواتيري اليومية</h1>
          <p className="text-sm text-gray-500">ملخص الفواتير التي أنشأتها أنت</p>
        </div>
      </div>

      <div className="card">
        <div className="text-xs text-gray-500">إجمالي الفواتير</div>
        <div className="text-2xl font-extrabold text-slate-650">{invoices.length}</div>
        <div className="text-sm text-gray-600 mt-1">إجمالي القيمة: {formatEGP(total)}</div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-3 text-right">رقم الفاتورة</th>
              <th className="p-3 text-right">العميل</th>
              <th className="p-3 text-right">المخزن</th>
              <th className="p-3 text-right">الحالة</th>
              <th className="p-3 text-right">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id} className="border-t hover:bg-gray-50">
                <td className="p-3 font-semibold">#{invoice.invoice_number}</td>
                <td className="p-3">{invoice.customer?.name || "—"}</td>
                <td className="p-3">{invoice.store?.name || "—"}</td>
                <td className="p-3">{invoice.status}</td>
                <td className="p-3 font-bold">{formatEGP(Number(invoice.total))}</td>
              </tr>
            ))}
            {invoices.length === 0 && <tr><td colSpan={5} className="p-10 text-center text-gray-400">لا توجد فواتير مسجلة لك بعد</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
