"use client";
import { useState } from "react";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { formatEGP, formatDate } from "@/lib/format";

interface Payment {
  id: string; payment_date: string; amount: number; payment_method: string; notes: string | null;
  customer?: { id: string; name: string; phone: string | null } | null;
  treasury?: { id: string; name: string } | null;
  creator?: { id: number; full_name: string } | null;
}
interface ApiResponse { items: Payment[]; total: number; total_amount: number; }

const METHODS = ["نقدي", "إنستاباي", "فودافون كاش", "تحويل بنكي", "شيك"];

export default function CustomerPaymentsPage() {
  const [show, setShow] = useState(false);
  const { data, loading, refetch } = useApi<ApiResponse>("/api/payments/customers?limit=200");

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
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-650">💰 تحصيلات العملاء</h1>
          <p className="text-sm text-gray-500">{data?.total ?? '...'} تحصيل • إجمالي: {data ? formatEGP(data.total_amount) : '...'} جنيه</p>
        </div>
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
                      className="text-xs px-2 py-1 bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 rounded font-bold"
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

      {show && <Form onClose={() => setShow(false)} onSaved={() => { setShow(false); refetch(); }} />}
    </div>
  );
}

function Form({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ customer_id: '', amount: 0, payment_method: 'نقدي', treasury_id: '', payment_date: '', notes: '' });
  const { mutate, loading } = useApiMutation();
  const [customers, setCustomers] = useState<{id:string;name:string}[]>([]);
  const [treasuries, setTreasuries] = useState<{id:string;name:string}[]>([]);
  const [custSearch, setCustSearch] = useState("");

  useState(() => {
    fetch('/api/treasury').then(r => r.json()).then(j => setTreasuries(j.data?.items || [])).catch(() => {});
    fetch('/api/customers?limit=5000').then(r => r.json()).then(j => setCustomers(j.data?.items || [])).catch(() => {});
  });

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
          <div><label className="text-sm font-medium block mb-1">المبلغ *</label><input type="number" step="0.01" className="input-field" value={f.amount === 0 ? '' : f.amount} onChange={(e) => setF({ ...f, amount: parseFloat(e.target.value) || 0 })} placeholder="0" /></div>
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
