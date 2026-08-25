import { getCurrentUser } from "@/lib/auth-server";
import { redirect } from "next/navigation";
import prisma from "@/lib/db/prisma";
import { canSeeCost } from "@/lib/auth";
import { KpiCard, SmallStat } from "@/components/DashboardCards";
import { LayoutDashboard } from "lucide-react";

export default async function DashboardPage() {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  // KPIs
  const [
    totalProducts,
    totalCustomers,
    totalSuppliers,
    totalStores,
    lowStockCount,
    todaySalesAgg,
    monthSalesAgg,
    openInvoices,
    pendingChecks,
    totalCustomersDebt,
    totalSuppliersDebt,
    totalInventoryValue,
    unpaidSalesAgg,
    unpaidPurchasesAgg,
  ] = await Promise.all([
    prisma.products.count({ where: { is_active: true } }),
    prisma.customers.count({ where: { is_active: true } }),
    prisma.suppliers.count({ where: { is_active: true } }),
    prisma.stores.count({ where: { is_active: true } }),
    // تحت الحد الأدنى
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint as count FROM elhoot.inventory
      WHERE current_stock <= reorder_level AND current_stock > 0
    `,
    prisma.sales_invoices.aggregate({
      where: { invoice_date: { gte: today }, status: 'مكتملة' },
      _sum: { total: true, net_profit: true },
      _count: true,
    }),
    prisma.sales_invoices.aggregate({
      where: { invoice_date: { gte: monthStart }, status: 'مكتملة' },
      _sum: { total: true, net_profit: true },
      _count: true,
    }),
    prisma.sales_invoices.count({ where: { status: 'قيد التنفيذ' } }),
    prisma.checks.count({ where: { status: 'تحت التحصيل' } }),
    // ديون العملاء
    prisma.customers.aggregate({
      where: { is_active: true, balance: { gt: 0 } },
      _sum: { balance: true },
    }),
    // ديون الموردين
    prisma.suppliers.aggregate({
      where: { is_active: true, balance: { gt: 0 } },
      _sum: { balance: true },
    }),
    canSeeCost(profile)
      ? prisma.$queryRaw<{ total: number }[]>`
          SELECT COALESCE(SUM(p.last_purchase_price * i.current_stock), 0)::numeric as total
          FROM elhoot.inventory i
          JOIN elhoot.products p ON p.id = i.product_id
          WHERE p.is_active = true AND i.current_stock > 0
        `.then(r => Number(r[0]?.total || 0))
      : Promise.resolve(0),
    // فواتير بيع غير محصلة
    prisma.sales_invoices.aggregate({
      where: { status: 'مكتملة', invoice_type: { not: 'عرض سعر' } },
      _sum: { total: true, paid_amount: true },
    }),
    // فواتير شراء غير مسددة
    prisma.purchase_invoices.aggregate({
      where: { status: 'مكتملة' },
      _sum: { total_amount: true, paid_amount: true },
    }),
  ]);

  const showCost = canSeeCost(profile);
  const lowStock = Number(lowStockCount[0]?.count || 0);
  const pendingSalesAmount = Number(unpaidSalesAgg._sum.total || 0) - Number(unpaidSalesAgg._sum.paid_amount || 0);
  const pendingPurchasesAmount = Number(unpaidPurchasesAgg._sum.total_amount || 0) - Number(unpaidPurchasesAgg._sum.paid_amount || 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-800 flex items-center gap-2">
            <LayoutDashboard className="w-8 h-8 text-elhoot-500" />
            <span>الرئيسية</span>
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            أهلاً {profile.full_name} —{" "}
            {new Date().toLocaleDateString("ar-EG", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
      </div>

      {/* KPIs — sales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          iconKey="sales"
          label="مبيعات اليوم"
          value={Number(todaySalesAgg._sum.total || 0)}
          subValue={`${todaySalesAgg._count} فاتورة`}
          color="green"
          isCurrency={true}
        />
        <KpiCard
          iconKey="calendar"
          label="مبيعات الشهر"
          value={Number(monthSalesAgg._sum.total || 0)}
          subValue={`${monthSalesAgg._count} فاتورة`}
          color="blue"
          isCurrency={true}
        />
        {showCost && (
          <KpiCard
            iconKey="profit"
            label="صافي ربح الشهر"
            value={Number(monthSalesAgg._sum.net_profit || 0)}
            subValue="بعد التكلفة"
            color="orange"
            isCurrency={true}
          />
        )}
        <KpiCard
          iconKey="folder"
          label="فواتير مفتوحة"
          value={openInvoices}
          subValue="قيد التنفيذ"
          color="purple"
        />
      </div>

      {/* KPIs — money & debt */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          iconKey="debt"
          label="ديون العملاء"
          value={Number(totalCustomersDebt._sum.balance || 0)}
          subValue="مستحقة لك في السوق"
          color="red"
          isCurrency={true}
        />
        <KpiCard
          iconKey="bank"
          label="ديون الموردين"
          value={Number(totalSuppliersDebt._sum.balance || 0)}
          subValue="عليك للموردين"
          color="yellow"
          isCurrency={true}
        />
        <KpiCard
          iconKey="check"
          label="شيكات معلقة"
          value={pendingChecks}
          subValue="تحت التحصيل"
          color="purple"
        />
        {showCost && (
          <KpiCard
            iconKey="package"
            label="قيمة المخزون"
            value={totalInventoryValue}
            subValue="بآخر سعر شراء"
            color="green"
            isCurrency={true}
          />
        )}
      </div>

      {/* KPIs — المعلقات */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          iconKey="clock"
          label="فواتير لم تُحصّل"
          value={pendingSalesAmount}
          subValue="مكتملة ورصيد متبقي"
          color="red"
          isCurrency={true}
        />
        <KpiCard
          iconKey="list"
          label="مشتريات لم تُسدّد"
          value={pendingPurchasesAmount}
          subValue="مكتملة ورصيد متبقي"
          color="yellow"
          isCurrency={true}
        />
        <KpiCard
          iconKey="chart"
          label="إجمالي المنتجات"
          value={totalProducts}
          subValue={`في ${totalStores} مخازن`}
          color="blue"
        />
        <KpiCard
          iconKey="users"
          label="إجمالي العملاء"
          value={totalCustomers}
          subValue={`+ ${totalSuppliers} موردين`}
          color="green"
        />
      </div>

      {/* System stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5 pt-2">
        <SmallStat iconKey="tags" label="المنتجات" value={totalProducts} />
        <SmallStat iconKey="users" label="العملاء" value={totalCustomers} />
        <SmallStat iconKey="factory" label="الموردين" value={totalSuppliers} />
        <SmallStat iconKey="building" label="المخازن" value={totalStores} />
        <SmallStat iconKey="alert" label="تحت الحد الأدنى" value={lowStock} highlight={lowStock > 0} />
      </div>

      {lowStock > 0 && (
        <div className="bg-rose-50 border-r-4 border-rose-500 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">⚠️</span>
            <div>
              <h3 className="font-extrabold text-rose-800 text-sm">تنبيه: {lowStock} صنف تحت الحد الأدنى بالمخزن</h3>
              <p className="text-xs text-rose-600 mt-0.5">يرجى مراجعة المخازن وإعادة الطلب للأصناف من الموردين.</p>
            </div>
          </div>
          <a
            href="/inventory"
            className="text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold px-4 py-2 rounded-xl transition-all shadow-sm"
          >
            عرض المخزون ←
          </a>
        </div>
      )}
    </div>
  );
}
