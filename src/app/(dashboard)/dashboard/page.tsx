import { getCurrentUser } from "@/lib/auth-server";
import { redirect } from "next/navigation";
import prisma from "@/lib/db/prisma";
import { formatEGP, formatQty } from "@/lib/format";
import { canSeeCost } from "@/lib/auth";

export default async function DashboardPage() {
  const profile = await getCurrentUser();
  if (!profile) redirect('/login');

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
    // تحت الحد الأدنى: يستثني المخزون الصفري (يعتبر مباع/مستهلك)
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
    // ديون العملاء = الرصيد الموجب فقط (اللي عليهم فلوس)
    prisma.customers.aggregate({
      where: { is_active: true, balance: { gt: 0 } },
      _sum: { balance: true },
    }),
    // ديون الموردين = الرصيد الموجب فقط (اللي لنا عليهم فلوس نخصمها من مستحقاتنا)
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
    // فواتير بيع مكتملة لم تُحصّل بالكامل
    prisma.sales_invoices.aggregate({
      where: { status: 'مكتملة', invoice_type: { not: 'عرض سعر' } },
      _sum: { total: true, paid_amount: true },
    }),
    // فواتير شراء مكتملة لم تُسدّد بالكامل
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
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-650">📊 الرئيسية</h1>
          <p className="text-sm text-gray-500 mt-1">أهلاً {profile.full_name} — {new Date().toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
      </div>

      {/* KPIs — sales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon="🛒"
          label="مبيعات اليوم"
          value={formatEGP(Number(todaySalesAgg._sum.total || 0))}
          subValue={`${todaySalesAgg._count} فاتورة`}
          color="green"
        />
        <KpiCard
          icon="📅"
          label="مبيعات الشهر"
          value={formatEGP(Number(monthSalesAgg._sum.total || 0))}
          subValue={`${monthSalesAgg._count} فاتورة`}
          color="blue"
        />
        {showCost && (
          <KpiCard
            icon="💰"
            label="صافي ربح الشهر"
            value={formatEGP(Number(monthSalesAgg._sum.net_profit || 0))}
            subValue="بعد التكلفة"
            color="orange"
          />
        )}
        <KpiCard
          icon="📂"
          label="فواتير مفتوحة"
          value={String(openInvoices)}
          subValue="قيد التنفيذ"
          color="purple"
        />
      </div>

      {/* KPIs — money & debt */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon="💳"
          label="ديون العملاء"
          value={formatEGP(Number(totalCustomersDebt._sum.balance || 0))}
          subValue="ليستحقة لك"
          color="red"
        />
        <KpiCard
          icon="🏦"
          label="ديون الموردين"
          value={formatEGP(Number(totalSuppliersDebt._sum.balance || 0))}
          subValue="عليك لموردين"
          color="yellow"
        />
        <KpiCard
          icon="🧾"
          label="شيكات معلقة"
          value={String(pendingChecks)}
          subValue="تحت التحصيل"
          color="purple"
        />
        {showCost && (
          <KpiCard
            icon="📦"
            label="قيمة المخزون"
            value={formatEGP(totalInventoryValue)}
            subValue="بآخر سعر شراء"
            color="green"
          />
        )}
      </div>

      {/* KPIs — المعلقات (اللي مفيش في الحسابات أعلاه) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon="⏳"
          label="فواتير لم تُحصّل"
          value={formatEGP(pendingSalesAmount)}
          subValue="مكتملة ورصيد متبقي"
          color="red"
        />
        <KpiCard
          icon="📋"
          label="مشتريات لم تُسدّد"
          value={formatEGP(pendingPurchasesAmount)}
          subValue="مكتملة ورصيد متبقي"
          color="yellow"
        />
        <KpiCard
          icon="📊"
          label="إجمالي المنتجات"
          value={String(totalProducts)}
          subValue={`في ${totalStores} مخزن`}
          color="blue"
        />
        <KpiCard
          icon="👥"
          label="إجمالي العملاء"
          value={String(totalCustomers)}
          subValue={`+ ${totalSuppliers} مورد`}
          color="green"
        />
      </div>

      {/* System stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SmallStat icon="🏷️" label="المنتجات" value={String(totalProducts)} />
        <SmallStat icon="👥" label="العملاء" value={String(totalCustomers)} />
        <SmallStat icon="🏭" label="الموردين" value={String(totalSuppliers)} />
        <SmallStat icon="🏢" label="المخازن" value={String(totalStores)} />
        <SmallStat icon="⚠️" label="تحت الحد الأدنى" value={String(lowStock)} highlight={lowStock > 0} />
      </div>

      {lowStock > 0 && (
        <div className="bg-red-50 border-r-4 border-red-500 rounded-lg p-4">
          <h3 className="font-bold text-red-800 mb-2">⚠️ تنبيه: {lowStock} صنف تحت الحد الأدنى</h3>
          <a href="/inventory" className="text-sm text-red-700 underline">عرض المخزون ←</a>
        </div>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value, subValue, color }: { icon: string; label: string; value: string; subValue: string; color: string }) {
  const colorClasses: Record<string, string> = {
    green: 'from-green-500/10 to-green-500/5 border-green-500/30',
    blue: 'from-blue-500/10 to-blue-500/5 border-blue-500/30',
    orange: 'from-orange-500/15 to-orange-500/5 border-orange-500/40',
    red: 'from-red-500/10 to-red-500/5 border-red-500/30',
    purple: 'from-purple-500/10 to-purple-500/5 border-purple-500/30',
    yellow: 'from-yellow-500/10 to-yellow-500/5 border-yellow-500/30',
  };
  return (
    <div className={`bg-gradient-to-br ${colorClasses[color]} border rounded-xl p-4 shadow-card`}>
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-xs text-gray-600 mb-1">{label}</div>
      <div className="text-xl md:text-2xl font-extrabold text-slate-650">{value}</div>
      <div className="text-[10px] text-gray-500 mt-0.5">{subValue}</div>
    </div>
  );
}

function SmallStat({ icon, label, value, highlight }: { icon: string; label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`card text-center ${highlight ? 'ring-2 ring-red-300 bg-red-50' : ''}`}>
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-xs text-gray-600">{label}</div>
      <div className={`text-lg font-bold ${highlight ? 'text-red-600' : 'text-slate-650'}`}>{value}</div>
    </div>
  );
}
