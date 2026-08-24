import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-server";
import prisma from "@/lib/db/prisma";

export default async function AdminRoutesPage() {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/dashboard");

  const customers = await prisma.customers.findMany({
    where: { is_active: true },
    orderBy: { name: "asc" },
    take: 200,
  });

  const routeCustomers = customers.filter((customer) => (customer.route_days?.length || 0) > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-650">🗓️ جدولة خطوط السير</h1>
          <p className="text-sm text-gray-500">العملاء الذين لديهم أيام مسار محددة</p>
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-3 text-right">العميل</th>
              <th className="p-3 text-right">الأيام</th>
              <th className="p-3 text-right">الهاتف</th>
            </tr>
          </thead>
          <tbody>
            {routeCustomers.map((customer) => (
              <tr key={customer.id} className="border-t hover:bg-gray-50">
                <td className="p-3 font-semibold">{customer.name}</td>
                <td className="p-3">{(customer.route_days || []).join("، ")}</td>
                <td className="p-3">{customer.phone || "—"}</td>
              </tr>
            ))}
            {routeCustomers.length === 0 && <tr><td colSpan={3} className="p-10 text-center text-gray-400">لا توجد خطوط سير مفعلة حاليًا</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
