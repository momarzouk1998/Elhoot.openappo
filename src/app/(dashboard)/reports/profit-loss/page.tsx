import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-server";
import { canSeeCost } from "@/lib/auth";
import prisma from "@/lib/db/prisma";
import { formatEGP } from "@/lib/format";

interface SearchParams {
  from?: string;
  to?: string;
}

export default async function ProfitLossPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const { from, to } = await searchParams;
  const showCost = canSeeCost(profile);

  if (!showCost) {
    return (
      <div className="card text-center py-12">
        <div className="text-4xl mb-4">🔒</div>
        <h2 className="text-xl font-bold mb-2">غير مسموح</h2>
        <p className="text-gray-600">ليس لديك صلاحية لعرض تقرير الأرباح والخسائر</p>
      </div>
    );
  }

  // تحديد الفترة الزمنية
  const fromDate = from ? new Date(from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const toDate = to ? new Date(to) : new Date();
  toDate.setHours(23, 59, 59, 999); // نهاية اليوم

  const [salesData, expensesData, collectionsData, supplierPaymentsData] = await Promise.all([
    // المبيعات المكتملة - يجب استخدام invoice_date مش created_at
    prisma.sales_invoices.aggregate({
      where: { 
        invoice_date: { gte: fromDate, lte: toDate },
        status: "مكتملة", 
        invoice_type: { not: "عرض سعر" } 
      },
      _sum: { total: true, net_profit: true },
      _count: true,
    }),
    // المصروفات
    prisma.expenses.aggregate({
      where: { expense_date: { gte: fromDate, lte: toDate } },
      _sum: { amount: true },
      _count: true,
    }),
    // التحصيلات
    prisma.customer_payments.aggregate({
      where: { payment_date: { gte: fromDate, lte: toDate } },
      _sum: { amount: true },
      _count: true,
    }),
    // مدفوعات الموردين
    prisma.supplier_payments.aggregate({
      where: { payment_date: { gte: fromDate, lte: toDate } },
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  // المصروفات حسب الفئة
  const expensesByCategory = await prisma.expenses.groupBy({
    by: ["category"],
    where: { expense_date: { gte: fromDate, lte: toDate } },
    _sum: { amount: true },
    _count: true,
  });
  expensesByCategory.sort((a, b) => Number(b._sum.amount || 0) - Number(a._sum.amount || 0));

  // الحسابات
  const totalSales = Number(salesData._sum.total || 0);
  const grossProfit = Number(salesData._sum.net_profit || 0);
  const totalExpenses = Number(expensesData._sum.amount || 0);
  const totalCollections = Number(collectionsData._sum.amount || 0);
  const totalSupplierPayments = Number(supplierPaymentsData._sum.amount || 0);

  // صافي الربح = إجمالي الربح من المبيعات - المصروفات
  const netProfit = grossProfit - totalExpenses;
  
  // صافي التدفق النقدي = التحصيلات - مدفوعات الموردين - المصروفات
  const netCashFlow = totalCollections - totalSupplierPayments - totalExpenses;

  // نسب مالية
  const expenseRatio = totalSales > 0 ? (totalExpenses / totalSales) * 100 : 0;
  const profitMargin = totalSales > 0 ? (netProfit / totalSales) * 100 : 0;

  const periodLabel = `من ${fromDate.toLocaleDateString('ar-EG')} إلى ${toDate.toLocaleDateString('ar-EG')}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-650">📊 تقرير الأرباح والخسائر</h1>
          <p className="text-sm text-gray-500">{periodLabel}</p>
        </div>
      </div>

      {/* فلتر التاريخ */}
      <div className="card">
        <form method="GET" className="flex flex-col md:flex-row gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">من تاريخ</label>
            <input
              type="date"
              name="from"
              defaultValue={from || fromDate.toISOString().split('T')[0]}
              className="input-field"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">إلى تاريخ</label>
            <input
              type="date"
              name="to"
              defaultValue={to || toDate.toISOString().split('T')[0]}
              className="input-field"
            />
          </div>
          <div className="flex items-end">
            <button type="submit" className="btn-primary">تحديث التقرير</button>
          </div>
        </form>
      </div>

      {/* الإيرادات */}
      <div className="card">
        <h2 className="text-lg font-bold mb-4 text-green-700">💰 الإيرادات</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="text-sm text-green-600 mb-1">إجمالي المبيعات</div>
            <div className="text-2xl font-bold text-green-700">{formatEGP(totalSales)}</div>
            <div className="text-xs text-green-600">{salesData._count} فاتورة</div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="text-sm text-blue-600 mb-1">إجمالي الربح</div>
            <div className="text-2xl font-bold text-blue-700">{formatEGP(grossProfit)}</div>
            <div className="text-xs text-blue-600">قبل المصروفات</div>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
            <div className="text-sm text-emerald-600 mb-1">التحصيلات النقدية</div>
            <div className="text-2xl font-bold text-emerald-700">{formatEGP(totalCollections)}</div>
            <div className="text-xs text-emerald-600">{collectionsData._count} تحصيل</div>
          </div>
        </div>
      </div>

      {/* المصروفات */}
      <div className="card">
        <h2 className="text-lg font-bold mb-4 text-red-700">📉 المصروفات والتكاليف</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="text-sm text-red-600 mb-1">إجمالي المصروفات</div>
            <div className="text-2xl font-bold text-red-700">{formatEGP(totalExpenses)}</div>
            <div className="text-xs text-red-600">{expensesData._count} مصروف</div>
          </div>
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <div className="text-sm text-orange-600 mb-1">مدفوعات الموردين</div>
            <div className="text-2xl font-bold text-orange-700">{formatEGP(totalSupplierPayments)}</div>
            <div className="text-xs text-orange-600">{supplierPaymentsData._count} سداد</div>
          </div>
        </div>

        {/* المصروفات حسب الفئة */}
        {expensesByCategory.length > 0 && (
          <div>
            <h3 className="font-semibold mb-3">المصروفات حسب الفئة</h3>
            <div className="space-y-2">
              {expensesByCategory.map((category) => {
                const amount = Number(category._sum.amount || 0);
                const percentage = totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0;
                return (
                  <div key={category.category} className="flex justify-between items-center">
                    <span className="text-sm font-medium">{category.category}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">{percentage.toFixed(1)}%</span>
                      <span className="font-bold">{formatEGP(amount)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* صافي النتائج */}
      <div className="card">
        <h2 className="text-lg font-bold mb-4">🎯 صافي النتائج</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className={`border-2 rounded-lg p-4 ${netProfit >= 0 ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
            <div className={`text-sm mb-1 ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              صافي الربح/الخسارة
            </div>
            <div className={`text-3xl font-bold ${netProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {formatEGP(netProfit)}
            </div>
            <div className={`text-xs ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              هامش ربح: {profitMargin.toFixed(1)}%
            </div>
          </div>
          <div className={`border-2 rounded-lg p-4 ${netCashFlow >= 0 ? 'bg-blue-50 border-blue-300' : 'bg-orange-50 border-orange-300'}`}>
            <div className={`text-sm mb-1 ${netCashFlow >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
              صافي التدفق النقدي
            </div>
            <div className={`text-3xl font-bold ${netCashFlow >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
              {formatEGP(netCashFlow)}
            </div>
            <div className={`text-xs ${netCashFlow >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
              التدفق الفعلي للأموال
            </div>
          </div>
        </div>
      </div>

      {/* النسب المالية */}
      <div className="card">
        <h2 className="text-lg font-bold mb-4">📈 النسب المالية</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-slate-650">{expenseRatio.toFixed(1)}%</div>
            <div className="text-sm text-gray-600">نسبة المصروفات</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-slate-650">{profitMargin.toFixed(1)}%</div>
            <div className="text-sm text-gray-600">هامش الربح</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-slate-650">
              {totalSales > 0 ? (grossProfit / totalSales * 100).toFixed(1) : '0.0'}%
            </div>
            <div className="text-sm text-gray-600">إجمالي هامش الربح</div>
          </div>
        </div>
      </div>
    </div>
  );
}