"use client";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { formatEGP, formatDate } from "@/lib/format";
import Pagination from "@/components/Pagination";

/* ============================================
   أنواع مشتركة
============================================ */
interface Customer {
  id: string; name: string; phone: string | null; balance: number; opening_balance: number;
  whatsapp?: string | null; address?: string | null; route_days?: string[];
}
interface Payment {
  id: string; payment_date: string; amount: number; payment_method: string; notes: string | null;
  customer?: { id: string; name: string; phone: string | null } | null;
  treasury?: { id: string; name: string } | null;
}

const TABS = [
  { key: 'customers', label: 'العملاء', icon: '👥' },
  { key: 'collections', label: 'التحصيلات', icon: '💰' },
  { key: 'route', label: 'خط السير', icon: '🗺️' },
] as const;
type TabKey = typeof TABS[number]['key'];

const DAYS = ["السبت", "الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];
const METHODS = ["نقدي", "إنستاباي", "فودافون كاش", "تحويل بنكي", "شيك"];

export default function CustomersPage() {
  const [tab, setTab] = useState<TabKey>('customers');

  return (
    <div className="space-y-4">
      {/* شريط التبويبات */}
      <div className="flex gap-2 border-b">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-bold transition-all border-b-2 -mb-px ${
              tab === t.key ? 'border-nazlawy-500 text-nazlawy-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'customers' && <CustomersTab />}
      {tab === 'collections' && <CollectionsTab />}
      {tab === 'route' && <RouteTab />}
    </div>
  );
}

/* ============================================
   تبويب العملاء
============================================ */
function CustomersTab() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [show, setShow] = useState(false);
  const [page, setPage] = useState(1);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, loading, refetch } = useApi<{ items: Customer[]; total: number; limit: number; page: number }>(
    `/api/customers?search=${encodeURIComponent(search)}&limit=50&page=${page}`
  );

  useEffect(() => {
    const pageParam = searchParams.get('page');
    if (pageParam) setPage(parseInt(pageParam));
  }, [searchParams]);

  const visibleCustomers = (data?.items ?? []).filter((c) => {
    const status = c.balance > 0.01 ? 'unpaid' : c.balance < -0.01 ? 'overpaid' : 'cleared';
    if (statusFilter === 'all') return true;
    return status === statusFilter;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-gray-500">{data?.total ?? '...'} عميل</p>
        <div className="flex gap-2">
          <a href="/print/statement/all-customers" target="_blank" className="btn-secondary text-sm flex items-center gap-1">
            📋 كشف حساب كل العملاء
          </a>
          <button onClick={() => setShow(true)} className="btn-primary">+ إضافة عميل</button>
        </div>
      </div>

      <div className="card flex flex-col gap-3 md:flex-row">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 ابحث..." className="input-field md:flex-1" autoFocus />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-field md:w-56">
          <option value="all">كل الحالات</option>
          <option value="unpaid">لم يتم السداد</option>
          <option value="overpaid">مدفوعات زائدة</option>
          <option value="cleared">حساب خالص</option>
        </select>
      </div>

      {/* كاردات إجماليات تتحرك مع البحث/الفلتر */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card p-4">
          <div className="text-xs text-gray-500">عدد العملاء</div>
          <div className="text-2xl font-extrabold text-slate-650">{visibleCustomers.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-gray-500">إجمالي الديون (لينا)</div>
          <div className="text-2xl font-extrabold text-red-700">{formatEGP(visibleCustomers.reduce((s, c) => s + (Number(c.balance) > 0 ? Number(c.balance) : 0), 0))} ج</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-gray-500">عملاء مدينين</div>
          <div className="text-2xl font-extrabold text-orange-700">{visibleCustomers.filter(c => Number(c.balance) > 0.01).length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-gray-500">مدفوعات مقدمة (علينا)</div>
          <div className="text-2xl font-extrabold text-green-700">{formatEGP(visibleCustomers.reduce((s, c) => s + (Number(c.balance) < 0 ? Math.abs(Number(c.balance)) : 0), 0))} ج</div>
        </div>
      </div>

      {loading ? <div className="card text-center py-12 text-gray-500">⏳ جاري التحميل...</div> : (
        <>
          {/* Mobile: كاردات */}
          <div className="space-y-2 md:hidden">
            {visibleCustomers.map(c => {
              const status = c.balance > 0.01 ? 'لم يتم السداد' : c.balance < -0.01 ? 'مدفوعات زائدة' : 'حساب خالص';
              const statusClass = c.balance > 0.01 ? 'bg-red-100 text-red-800' : c.balance < -0.01 ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800';
              return (
                <div
                  key={c.id}
                  onClick={() => router.push(`/customers/${c.id}`)}
                  className="card p-3 cursor-pointer hover:border-nazlawy-500 hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between mb-1.5">
                    <div className="font-bold text-sm truncate flex-1">{c.name}</div>
                    <span className={`badge ${statusClass} shrink-0 mr-2`}>{status}</span>
                  </div>
                  <div className="text-xs text-gray-500 font-mono mb-1.5">{c.phone || '—'}</div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">الرصيد:</span>
                    <span className={`font-bold font-mono ${c.balance > 0.01 ? 'text-red-700' : c.balance < -0.01 ? 'text-blue-700' : 'text-green-700'}`}>
                      {formatEGP(c.balance)} ج
                    </span>
                  </div>
                </div>
              );
            })}
            {visibleCustomers.length === 0 && (
              <div className="card text-center py-12 text-gray-400">لا يوجد عملاء</div>
            )}
          </div>

          {/* Desktop: جدول */}
          <div className="card overflow-x-auto p-0 hidden md:block">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-3 text-right">الاسم</th>
                  <th className="p-3 text-right">الهاتف</th>
                  <th className="p-3 text-right">رصيد سابق</th>
                  <th className="p-3 text-right">الرصيد الحالي</th>
                  <th className="p-3 text-right">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {visibleCustomers.map(c => {
                  const status = c.balance > 0.01 ? 'لم يتم السداد' : c.balance < -0.01 ? 'مدفوعات زائدة' : 'حساب خالص';
                  const statusClass = c.balance > 0.01 ? 'bg-red-100 text-red-800' : c.balance < -0.01 ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800';
                  return (
                    <tr key={c.id} onClick={() => router.push(`/customers/${c.id}`)} className="border-t hover:bg-gray-50 cursor-pointer transition-colors hover:text-nazlawy-600">
                      <td className="p-3 font-semibold">{c.name}</td>
                      <td className="p-3 text-sm font-mono">{c.phone || '—'}</td>
                      <td className="p-3 font-mono text-xs">{formatEGP(c.opening_balance)}</td>
                      <td className="p-3 font-mono font-bold">{formatEGP(c.balance)}</td>
                      <td className="p-3"><span className={`badge ${statusClass}`}>{status}</span></td>
                    </tr>
                  );
                })}
                {visibleCustomers.length === 0 && <tr><td colSpan={5} className="p-12 text-center text-gray-400">لا يوجد عملاء</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {data && data.total > 0 && (
        <Pagination
          total={data.total}
          page={data.page}
          pageSize={data.limit}
          baseUrl="/customers"
        />
      )}

      {show && <CustomerForm onClose={() => setShow(false)} onSaved={() => { setShow(false); refetch(); }} />}
    </div>
  );
}

function CustomerForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: '', phone: '', whatsapp: '', address: '', opening_balance: 0, route_days: [] as string[], notes: '' });
  const { mutate, loading } = useApiMutation();

  async function save() {
    if (!f.name.trim()) { alert('❌ اسم العميل مطلوب'); return; }
    const { error } = await mutate('POST', '/api/customers', f);
    if (error) { alert('❌ ' + error); return; }
    onSaved();
  }

  function toggleDay(day: string) {
    setF(prev => ({
      ...prev,
      route_days: prev.route_days.includes(day) ? prev.route_days.filter(d => d !== day) : [...prev.route_days, day],
    }));
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-3 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold">+ إضافة عميل</h2>
        <div><label className="text-sm font-medium block mb-1">الاسم *</label><input className="input-field" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-sm font-medium block mb-1">الهاتف</label><input className="input-field" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
          <div><label className="text-sm font-medium block mb-1">واتساب</label><input className="input-field" value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} /></div>
        </div>
        <div><label className="text-sm font-medium block mb-1">العنوان</label><input className="input-field" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></div>
        <div>
          <label className="text-sm font-medium block mb-1">الرصيد الافتتاحي</label>
          <input type="number" step="0.01" className="input-field" value={f.opening_balance} onChange={(e) => setF({ ...f, opening_balance: parseFloat(e.target.value) || 0 })} />
          <div className="text-xs text-gray-600 mt-2 bg-blue-50 border border-blue-100 rounded p-2 leading-relaxed">
            <div className="font-bold text-blue-800 mb-1">💡 شرح الرصيد الافتتاحي:</div>
            <div>• <strong>بالموجب</strong> (مثلاً 1000): العميل <span className="text-red-700 font-bold">مدين</span> لك بهذا المبلغ (عنده دين عليك ما دفعه).</div>
            <div>• <strong>بالسالب</strong> (مثلاً -500): رصيد <span className="text-green-700 font-bold">دائن</span> للعميل (أنت مدين له / دفع مقدماً).</div>
            <div>• <strong>صفر</strong>: حساب جديد لا يوجد عليه رصيد سابق.</div>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium block mb-2">🗓️ أيام خط السير</label>
          <div className="flex flex-wrap gap-2">
            {DAYS.map(day => (
              <button key={day} type="button" onClick={() => toggleDay(day)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${f.route_days.includes(day) ? 'bg-nazlawy-500 text-white border-nazlawy-500' : 'bg-white text-gray-600 border-gray-300 hover:border-nazlawy-400'}`}>
                {day}
              </button>
            ))}
          </div>
          {f.route_days.length > 0 && <p className="text-xs text-nazlawy-600 mt-1">✓ {f.route_days.length} يوم محدد</p>}
        </div>
        <div><label className="text-sm font-medium block mb-1">ملاحظات</label><textarea className="input-field" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
        <div className="flex gap-2 pt-3"><button onClick={save} disabled={loading || !f.name} className="btn-primary flex-1">{loading ? 'جاري الحفظ...' : 'حفظ'}</button><button onClick={onClose} className="btn-secondary">إلغاء</button></div>
      </div>
    </div>
  );
}

/* ============================================
   تبويب خط السير
============================================ */
function RouteTab() {
  const [selectedDay, setSelectedDay] = useState("");
  const { data, loading } = useApi<{ items: Customer[]; total: number }>("/api/customers?limit=9999");

  const customers = (data?.items || []).filter(c => c.route_days && c.route_days.length > 0);
  const filtered = selectedDay ? customers.filter(c => c.route_days!.includes(selectedDay)) : customers;

  const byDay = DAYS.map(day => ({
    day,
    customers: customers.filter(c => c.route_days!.includes(day)),
  }));

  const totalDebt = filtered.reduce((s, c) => s + Number(c.balance), 0);
  const withoutRoute = (data?.items || []).filter(c => !c.route_days || c.route_days.length === 0).length;

  return (
    <div className="space-y-4">
      {/* كروت الأيام */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
        {byDay.map(({ day, customers: dayCustomers }) => {
          const dayDebt = dayCustomers.reduce((s, c) => s + Number(c.balance), 0);
          return (
            <button
              key={day}
              onClick={() => setSelectedDay(selectedDay === day ? "" : day)}
              className={`card p-3 text-center transition-all ${selectedDay === day ? "ring-2 ring-nazlawy-500 bg-nazlawy-50" : "hover:shadow-md"}`}
            >
              <div className="text-sm font-bold text-slate-650">{day}</div>
              <div className="text-xs text-gray-500">{dayCustomers.length} عميل</div>
              <div className="text-xs font-mono mt-1 text-orange-700">{formatEGP(dayDebt)}</div>
            </button>
          );
        })}
      </div>

      {/* عملاء بدون مسار */}
      {withoutRoute > 0 && (
        <div className="card p-4 bg-yellow-50 border border-yellow-200">
          <div className="text-sm text-yellow-800">⚠️ {withoutRoute} عميل بدون أيام زيارة محددة</div>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold">{selectedDay ? `عملاء ${selectedDay}` : "كل العملاء بخط سير"}</h2>
          <p className="text-sm text-gray-500">{filtered.length} عميل • إجمالي ديون: {formatEGP(totalDebt)} جنيه</p>
        </div>
        {selectedDay && <button onClick={() => setSelectedDay("")} className="btn-secondary">إظهار الكل</button>}
      </div>

      {loading ? <div className="card text-center py-12 text-gray-500">⏳ جاري التحميل...</div> : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3 text-right">الاسم</th>
                <th className="p-3 text-right">الهاتف</th>
                <th className="p-3 text-right">العنوان</th>
                <th className="p-3 text-right">أيام الزيارة</th>
                <th className="p-3 text-right">الرصيد</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 font-semibold">{c.name}</td>
                  <td className="p-3 text-xs font-mono">
                    {c.phone && <a href={`tel:${c.phone}`} className="text-nazlawy-600 hover:underline">{c.phone}</a>}
                    {!c.phone && "—"}
                  </td>
                  <td className="p-3 text-xs text-gray-600">{c.address || '—'}</td>
                  <td className="p-3">
                    <div className="flex gap-1 flex-wrap">
                      {c.route_days!.map(d => (
                        <span key={d} className={`badge text-xs ${d === selectedDay ? "bg-nazlawy-100 text-nazlawy-800" : "bg-gray-100"}`}>{d}</span>
                      ))}
                    </div>
                  </td>
                  <td className="p-3 font-mono font-bold text-red-700">{formatEGP(c.balance)}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={5} className="p-12 text-center text-gray-400">لا يوجد عملاء</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ============================================
   تبويب التحصيلات
============================================ */
function CollectionsTab() {
  const [show, setShow] = useState(false);
  const { data, loading, refetch } = useApi<{ items: Payment[]; total: number; total_amount: number }>("/api/payments/customers?limit=200");

  async function handleDelete(p: Payment) {
    if (!confirm(`⚠️ هل أنت متأكد من حذف سند التحصيل بمبلغ ${formatEGP(p.amount)} ج للعميل "${p.customer?.name || 'غير محدد'}"؟\n\nسيتم إرجاع المبلغ لرصيد العميل وتخصيمه من الخزينة.`)) return;
    try {
      const res = await fetch(`/api/payments/customers/${p.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) {
        alert("❌ " + (json?.error?.message || json?.error?.code || "فشل في الحذف"));
        return;
      }
      alert("✅ تم حذف سند التحصيل وإرجاع المبلغ لرصيد العميل وتحديث الخزينة");
      refetch();
    } catch {
      alert("❌ حدث خطأ أثناء الحذف");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-gray-500">{data?.total ?? '...'} تحصيل • إجمالي: {data ? formatEGP(data.total_amount) : '...'} جنيه</p>
        <button onClick={() => setShow(true)} className="btn-primary">+ تحصيل جديد</button>
      </div>

      {loading ? <div className="card text-center py-12 text-gray-500">⏳ جاري التحميل...</div> : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3 text-right">التاريخ</th>
                <th className="p-3 text-right">العميل</th>
                <th className="p-3 text-right">الخزينة</th>
                <th className="p-3 text-right">طريقة الدفع</th>
                <th className="p-3 text-right">المبلغ</th>
                <th className="p-3 text-right">ملاحظات</th>
                <th className="p-3 text-center">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map(p => (
                <tr key={p.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 text-xs">{formatDate(p.payment_date)}</td>
                  <td className="p-3 font-semibold">{p.customer?.name || '—'}</td>
                  <td className="p-3 text-xs text-gray-600">{p.treasury?.name || '—'}</td>
                  <td className="p-3 text-xs">{p.payment_method}</td>
                  <td className="p-3 font-mono font-bold text-green-700">{formatEGP(p.amount)}</td>
                  <td className="p-3 text-xs text-gray-500">{p.notes || '—'}</td>
                  <td className="p-3 text-center">
                    <button
                      onClick={() => handleDelete(p)}
                      className="text-xs px-2.5 py-1 bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 rounded-md font-bold transition-colors"
                      title="حذف سند التحصيل وإرجاع المبلغ لرصيد العميل"
                    >
                      🗑️ حذف
                    </button>
                  </td>
                </tr>
              ))}
              {data?.items.length === 0 && <tr><td colSpan={7} className="p-12 text-center text-gray-400">لا توجد تحصيلات</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {show && <CollectionForm onClose={() => setShow(false)} onSaved={() => { setShow(false); refetch(); }} />}
    </div>
  );
}

function CollectionForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ customer_id: '', amount: 0, payment_method: 'نقدي', treasury_id: '', payment_date: '', notes: '' });
  const { mutate, loading } = useApiMutation();
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [treasuries, setTreasuries] = useState<{ id: string; name: string }[]>([]);
  const [custSearch, setCustSearch] = useState("");

  useEffect(() => {
    fetch('/api/treasury').then(r => r.json()).then(j => setTreasuries(j.data?.items || [])).catch(() => {});
    fetch('/api/customers?limit=200').then(r => r.json()).then(j => setCustomers(j.data?.items || [])).catch(() => {});
  }, []);

  const filtered = customers.filter(c => c.name.includes(custSearch)).slice(0, 50);

  async function save() {
    if (!f.customer_id || !f.treasury_id || f.amount <= 0) { alert('❌ أكمل البيانات'); return; }
    const { error } = await mutate('POST', '/api/payments/customers', f);
    if (error) { alert('❌ ' + error); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-3">
        <h2 className="text-xl font-bold">+ تحصيل من عميل</h2>
        <div>
          <label className="text-sm font-medium block mb-1">العميل *</label>
          <input className="input-field" placeholder="🔍 ابحث عن عميل..." value={custSearch} onChange={(e) => setCustSearch(e.target.value)} autoFocus />
          <select className="input-field mt-1" value={f.customer_id} onChange={(e) => setF({ ...f, customer_id: e.target.value })} size={4}>
            {filtered.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-sm font-medium block mb-1">المبلغ *</label><input type="number" step="0.01" className="input-field" value={f.amount} onChange={(e) => setF({ ...f, amount: parseFloat(e.target.value) || 0 })} /></div>
          <div>
            <label className="text-sm font-medium block mb-1">طريقة الدفع</label>
            <select className="input-field" value={f.payment_method} onChange={(e) => setF({ ...f, payment_method: e.target.value })}>
              {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium block mb-1">الخزينة *</label>
            <select className="input-field" value={f.treasury_id} onChange={(e) => setF({ ...f, treasury_id: e.target.value })}>
              <option value="">اختر...</option>
              {treasuries.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div><label className="text-sm font-medium block mb-1">التاريخ</label><input type="date" className="input-field" value={f.payment_date} onChange={(e) => setF({ ...f, payment_date: e.target.value })} /></div>
        </div>
        <div><label className="text-sm font-medium block mb-1">ملاحظات</label><input className="input-field" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
        <div className="flex gap-2 pt-3"><button onClick={save} disabled={loading} className="btn-primary flex-1">{loading ? 'جاري الحفظ...' : 'حفظ'}</button><button onClick={onClose} className="btn-secondary">إلغاء</button></div>
      </div>
    </div>
  );
}
