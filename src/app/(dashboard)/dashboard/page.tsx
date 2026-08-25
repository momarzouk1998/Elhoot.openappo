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
    totalCustomersDebt,
    totalSuppliersDebt,
    totalInventoryValue,
    totalTreasuryBalanceAgg,
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
    prisma.treasuries.aggregate({
      where: { is_active: true },
      _sum: { current_balance: true },
    }),
  ]);

  const showCost = canSeeCost(profile);
  const lowStock = Number(lowStockCount[0]?.count || 0);

  const inventoryVal = Number(totalInventoryValue || 0);
  const custDebt = Number(totalCustomersDebt._sum.balance || 0);
  const suppDebt = Number(totalSuppliersDebt._sum.balance || 0);
  const treasuryBal = Number(totalTreasuryBalanceAgg._sum.current_balance || 0);

  // ما تملكه فعلياً = قيمة البضاعة + ديون العملاء + رصيد الخزائن - ديون الموردين
  const whatYouOwn = inventoryVal + custDebt + treasuryBal - suppDebt;

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

      {/* Row 1 — Sales & Cash */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          iconKey="sales"
          label="مبيعات اليوم"
          value={Number(todaySalesAgg._sum.total || 0)}
          subValue={`${todaySalesAgg._count} فاتورة مكتملة`}
          color="green"
          isCurrency={true}
        />
        <KpiCard
          iconKey="calendar"
          label="مبيعات الشهر"
          value={Number(monthSalesAgg._sum.total || 0)}
          subValue={`${monthSalesAgg._count} فاتورة مكتملة`}
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
          iconKey="bank"
          label="رصيد الخزائن"
          value={treasuryBal}
          subValue="السيولة المتوفرة بالخزن"
          color="purple"
          isCurrency={true}
        />
      </div>

      {/* Row 2 — Debts & Inventory */}
      <div className={`grid grid-cols-1 ${showCost ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4`}>
        <KpiCard
          iconKey="debt"
          label="ديون العملاء (اللي ليا في السوق)"
          value={custDebt}
          subValue="مستحقة لك طرف العملاء"
          color="red"
          isCurrency={true}
        />
        <KpiCard
          iconKey="bank"
          label="ديون الموردين (اللي عليا للموردين)"
          value={suppDebt}
          subValue="مستحقة للموردين عليك"
          color="yellow"
          isCurrency={true}
        />
        {showCost && (
          <KpiCard
            iconKey="package"
            label="قيمة المخزون (رأس المال في البضاعة)"
            value={inventoryVal}
            subValue="مجموع قيمة بضاعتك بآخر سعر شراء"
            color="blue"
            isCurrency={true}
          />
        )}
      </div>

      {/* Row 3 — What You Own (صافي رأس المال) - Last Card */}
      {showCost && (
        <div className="grid grid-cols-1 gap-4">
          <KpiCard
            iconKey="own"
            label="ما تملكه فعلياً (صافي رأس المال)"
            value={whatYouOwn}
            subValue="المعادلة: قيمة المخزون + ديون العملاء + رصيد الخزائن - ديون الموردين"
            color="green"
            isCurrency={true}
          />
        </div>
      )}

      {/* Row 4 — System Statistics Counts */}
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
