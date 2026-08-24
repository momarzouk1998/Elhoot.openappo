"use client";
import { useState } from "react";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { formatEGP, formatDate } from "@/lib/format";

interface Expense {
  id: string; expense_date: string; category: string; description: string;
  amount: number; payment_method: string; notes: string | null;
  treasury?: { id: string; name: string } | null;
  creator?: { id: number; full_name: string } | null;
}
interface ApiResponse { items: Expense[]; total: number; total_amount: number; }

const CATEGORIES = ["إيجار", "كهرباء", "مرتبات", "عمولة مندوب", "سلف", "صيانة", "نقل", "أخرى"];
const METHODS = ["نقدي", "إنستاباي", "فودافون كاش", "تحويل بنكي", "شيك"];

export default function ExpensesPage() {
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const { data, loading, refetch } = useApi<ApiResponse>("/api/expenses?limit=200");

  async function deleteExpense(e: Expense) {
    if (!confirm(`حذف المصروف "${e.description}" بقيمة ${formatEGP(e.amount)} ج؟\nسيتم إرجاع المبلغ للخزينة.`)) return;
    const res = await fetch(`/api/expenses/${e.id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) { alert('❌ ' + (json?.error?.message || json?.error?.code || 'تعذّر الحذف')); return; }
    alert('✅ تم حذف المصروف وإرجاع المبلغ للخزينة');
    refetch();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-650">📉 المصروفات</h1>
          <p className="text-sm text-gray-500">{data?.total ?? '...'} مصروف • إجمالي: {data ? formatEGP(data.total_amount) : '...'} جنيه</p>
        </div>
        <button onClick={() => setShow(true)} className="btn-primary">+ إضافة مصروف</button>
      </div>

      {loading ? <div className="card text-center py-12 text-gray-500">⏳ جاري التحميل...</div> : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3 text-right">التاريخ</th>
                <th className="p-3 text-right">الفئة</th>
                <th className="p-3 text-right">البيان</th>
                <th className="p-3 text-right">الخزينة</th>
                <th className="p-3 text-right">طريقة الدفع</th>
                <th className="p-3 text-right">المبلغ</th>
                <th className="p-3 text-right">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map(e => (
                <tr key={e.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 text-xs">{formatDate(e.expense_date)}</td>
                  <td className="p-3"><span className="badge bg-purple-100 text-purple-800">{e.category}</span></td>
                  <td className="p-3 font-semibold">{e.description}</td>
                  <td className="p-3 text-xs text-gray-600">{e.treasury?.name || '—'}</td>
                  <td className="p-3 text-xs">{e.payment_method}</td>
                  <td className="p-3 font-mono font-bold text-red-700">{formatEGP(e.amount)}</td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <button onClick={() => setEditing(e)} className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200">✏️</button>
                      <button onClick={() => deleteExpense(e)} className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200">🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
              {data?.items.length === 0 && <tr><td colSpan={7} className="p-12 text-center text-gray-400">لا توجد مصروفات</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {show && <Form onClose={() => setShow(false)} onSaved={() => { setShow(false); refetch(); }} />}
      {editing && <EditForm expense={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refetch(); }} />}
    </div>
  );
}

function EditForm({ expense, onClose, onSaved }: { expense: Expense; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    category: expense.category,
    description: expense.description,
    amount: expense.amount,
    payment_method: expense.payment_method,
    expense_date: expense.expense_date ? expense.expense_date.substring(0, 10) : '',
    notes: expense.notes || '',
  });
  const { mutate, loading } = useApiMutation();

  async function save() {
    if (!f.description.trim()) { alert('❌ البيان مطلوب'); return; }
    if (!f.amount || f.amount <= 0) { alert('❌ المبلغ غير صالح'); return; }
    const { error } = await mutate('PATCH', `/api/expenses/${expense.id}`, f);
    if (error) { alert('❌ ' + error); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-3">
        <h2 className="text-xl font-bold">✏️ تعديل مصروف</h2>
        <p className="text-xs text-orange-600">⚠️ التعديل مسموح لمصروفات اليوم فقط. لا يمكن تغيير الخزينة.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium block mb-1">الفئة *</label>
            <select className="input-field" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">طريقة الدفع</label>
            <select className="input-field" value={f.payment_method} onChange={(e) => setF({ ...f, payment_method: e.target.value })}>
              {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <div><label className="text-sm font-medium block mb-1">البيان *</label><input className="input-field" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} autoFocus /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-sm font-medium block mb-1">المبلغ *</label><input type="number" step="0.01" className="input-field" value={f.amount === 0 ? '' : f.amount} onChange={(e) => setF({ ...f, amount: parseFloat(e.target.value) || 0 })} placeholder="0" /></div>
          <div><label className="text-sm font-medium block mb-1">التاريخ</label><input type="date" className="input-field" value={f.expense_date} onChange={(e) => setF({ ...f, expense_date: e.target.value })} /></div>
        </div>
        <div><label className="text-sm font-medium block mb-1">ملاحظات</label><input className="input-field" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
        <div className="flex gap-2 pt-3"><button onClick={save} disabled={loading} className="btn-primary flex-1">{loading ? 'جاري الحفظ...' : 'حفظ التعديلات'}</button><button onClick={onClose} className="btn-secondary">إلغاء</button></div>
      </div>
    </div>
  );
}

function Form({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ category: 'إيجار', description: '', amount: 0, payment_method: 'نقدي', treasury_id: '', expense_date: '', notes: '' });
  const { mutate, loading } = useApiMutation();
  const [treasuries, setTreasuries] = useState<{id:string;name:string}[]>([]);

  // load treasuries on mount
  useState(() => {
    fetch('/api/treasury').then(r => r.json()).then(j => setTreasuries(j.data?.items || [])).catch(() => {});
  });

  async function save() {
    if (!f.treasury_id) { alert('❌ اختر الخزينة'); return; }
    if (!f.description || f.amount <= 0) { alert('❌ أدخل البيان والمبلغ'); return; }
    const { error } = await mutate('POST', '/api/expenses', f);
    if (error) { alert('❌ ' + error); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-3">
        <h2 className="text-xl font-bold">+ إضافة مصروف</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium block mb-1">الفئة *</label>
            <select className="input-field" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">طريقة الدفع</label>
            <select className="input-field" value={f.payment_method} onChange={(e) => setF({ ...f, payment_method: e.target.value })}>
              {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <div><label className="text-sm font-medium block mb-1">البيان *</label><input className="input-field" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} autoFocus /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-sm font-medium block mb-1">المبلغ *</label><input type="number" step="0.01" className="input-field" value={f.amount === 0 ? '' : f.amount} onChange={(e) => setF({ ...f, amount: parseFloat(e.target.value) || 0 })} placeholder="0" /></div>
          <div><label className="text-sm font-medium block mb-1">الخزينة *</label>
            <select className="input-field" value={f.treasury_id} onChange={(e) => setF({ ...f, treasury_id: e.target.value })}>
              <option value="">اختر...</option>
              {treasuries.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>
        <div><label className="text-sm font-medium block mb-1">التاريخ</label><input type="date" className="input-field" value={f.expense_date} onChange={(e) => setF({ ...f, expense_date: e.target.value })} /></div>
        <div><label className="text-sm font-medium block mb-1">ملاحظات</label><input className="input-field" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
        <div className="flex gap-2 pt-3"><button onClick={save} disabled={loading} className="btn-primary flex-1">{loading ? 'جاري الحفظ...' : 'حفظ'}</button><button onClick={onClose} className="btn-secondary">إلغاء</button></div>
      </div>
    </div>
  );
}
