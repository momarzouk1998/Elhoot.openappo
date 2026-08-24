import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-server";
import prisma from "@/lib/db/prisma";

export default async function AdminStoresPage() {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/dashboard");

  const stores = await prisma.stores.findMany({
    where: { is_active: true },
    include: { inventory: true },
    orderBy: { name: "asc" },
    take: 100,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-650">🏢 المخازن والفروع</h1>
          <p className="text-sm text-gray-500">عرض المخازن النشطة وعدد العناصر داخل كل مخزن</p>
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-3 text-right">الاسم</th>
              <th className="p-3 text-right">النوع</th>
              <th className="p-3 text-right">العناصر</th>
            </tr>
          </thead>
          <tbody>
            {stores.map((store) => (
              <tr key={store.id} className="border-t hover:bg-gray-50">
                <td className="p-3 font-semibold">{store.name}</td>
                <td className="p-3">{store.type}</td>
                <td className="p-3">{store.inventory.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
