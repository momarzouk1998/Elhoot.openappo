"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { formatEGP, formatDate } from "@/lib/format";

interface SupplierDetail {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  opening_balance: number;
  balance: number;
  notes: string | null;
}
interface Payment {
  id: string; payment_date: string; amount: number; payment_method: string; notes: string | null;
  treasury?: { id: string; name: string } | null;
}
interface PurchaseInvoice {
  id: string; purchase_number: number; purchase_date: string; total_amount: number; status: string;
  _count?: { items: number };
}
interface Check {
  id: string; direction: string; bank_name: string | null; check_number: string | null;
  amount: number; due_date: string; status: string; notes: string | null;
}
const METHODS = ["نقدي", "إنستاباي", "فودافون كاش", "تحويل بنكي", "شيك"];
const CHECK_STATUS_STYLES: Record<string, string> = {
  "تحت التحصيل": "bg-yellow-100 text-yellow-800",
  "تم الصرف": "bg-green-100 text-green-800",
  "مرفوض": "bg-red-100 text-red-800",
  "مُلغى": "bg-gray-100 text-gray-800",
};

export default function SupplierDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [supplier, setSupplier] = useState<SupplierDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPay, setShowPay] = useState(false);
  const [showCheck, setShowCheck] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/suppliers/${params.id}`);
        const json = await res.json();
        setSupplier(json?.data ?? null);
      } catch {
        setSupplier(null);
      } finally {
        setLoading(false);
      }
    }
    if (params.id) load();
  }, [params.id]);

  if (loading) return <div className="card py-12 text-center text-gray-500">⏳ جاري التحميل...</div>;

  if (!supplier) {
    return <div className="space-y-4">
      <button onClick={() => router.back()} className="btn-secondary">↩️ العودة</button>
      <div className="card py-12 text-center text-gray-500">لا توجد بيانات لهذا المورد</div>
    </div>;
  }

  return (
    <div className="space-y-4">
      {/* رأس الصفحة */}
      <div className="space-y-2">
        <h1 className="text-xl md:text-2xl font-extrabold text-slate-800 break-words">
          🏭 {supplier.name}
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.open(`/print/statement/supplier/${supplier.id}`, '_blank')}
            className="text-xs sm:text-sm font-bold px-3 py-2 rounded-xl bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-300 flex items-center gap-1 shadow-sm cursor-pointer"
          >
            <span>🖨️</span>
            <span>كشف حساب</span>
          </button>
          <button
            onClick={() => setShowEdit(true)}
            className="text-xs sm:text-sm font-bold p-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300 shadow-sm cursor-pointer"
            title="تعديل"
          >
            ✏️
          </button>
          <button
            onClick={() => deleteSupplier(supplier, router)}
            className="text-xs sm:text-sm font-bold p-2 rounded-xl bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 shadow-sm cursor-pointer"
            title="حذف"
          >
            🗑️
          </button>
        </div>
      </div>

      {/* جدول بيانات المورد */}
      <div className="card p-0 overflow-hidden border border-slate-200">
        <table className="w-full text-xs sm:text-sm border-collapse">
          <tbody>
            <tr className="border-b bg-slate-50/50">
              <td className="p-2.5 font-bold text-gray-500 w-1/4 border-l">الهاتف:</td>
              <td colSpan={3} className="p-2.5 font-semibold text-slate-800 font-mono">{supplier.phone || '—'}</td>
            </tr>
            <tr className="border-b">
              <td className="p-2.5 font-bold text-gray-500 border-l">رصيد افتتاحي:</td>
              <td className="p-2.5 font-bold font-mono text-slate-700 border-l">{formatEGP(supplier.opening_balance)} ج</td>
              <td className="p-2.5 font-bold text-gray-500 border-l">الرصيد الحالي:</td>
              <td className={`p-2.5 font-extrabold font-mono text-base ${Number(supplier.balance) > 0 ? 'text-red-700' : Number(supplier.balance) < 0 ? 'text-blue-700' : 'text-emerald-700'}`}>
                {formatEGP(supplier.balance)} ج
              </td>
            </tr>
            <tr className="border-b bg-slate-50/50">
              <td className="p-2.5 font-bold text-gray-500 border-l">العنوان:</td>
              <td colSpan={3} className="p-2.5 font-semibold text-slate-800">{supplier.address || '—'}</td>
            </tr>
            <tr>
              <td className="p-2.5 font-bold text-gray-500 border-l">الملاحظات:</td>
              <td colSpan={3} className="p-2.5 font-semibold text-slate-800">{supplier.notes || '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* قسم كشف الحساب */}
      <StatementSection supplierId={supplier.id} balance={Number(supplier.balance)} onPay={() => setShowPay(true)} />

      {/* قسم فواتير المورد */}
      <InvoicesSection supplierId={supplier.id} />

      {/* قسم شيكات المورد */}
      <ChecksSection supplierId={supplier.id} onAdd={() => setShowCheck(true)} />

      {showPay && (
        <PayForm supplierId={supplier.id} onClose={() => setShowPay(false)} onSaved={() => { setShowPay(false); router.refresh(); }} />
      )}
      {showCheck && (
        <CheckForm supplierId={supplier.id} onClose={() => setShowCheck(false)} onSaved={() => { setShowCheck(false); router.refresh(); }} />
      )}
      {showEdit && (
        <EditForm supplier={supplier} onClose={() => setShowEdit(false)} onSaved={() => { setShowEdit(false); router.refresh(); }} />
      )}
    </div>
  );
}

// حذف المورد (آمن)
async function deleteSupplier(supplier: SupplierDetail, router: ReturnType<typeof useRouter>) {
  if (!confirm(`حذف المورد "${supplier.name}"؟`)) return;
  const res = await fetch(`/api/suppliers/${supplier.id}`, { method: 'DELETE', cache: 'no-store' });
  const json = await res.json();
  if (!res.ok) {
    alert('❌ ' + (json?.error?.message || json?.error?.code || 'تعذّر الحذف'));
    return;
  }
  alert('✅ تم حذف المورد');
  router.push('/suppliers');
  router.refresh(); // إجبار تحديث البيانات
}

/* ============================================
   قسم كشف الحساب
============================================ */
function StatementSection({ supplierId, balance, onPay }: { supplierId: string; balance: number; onPay: () => void }) {
  const { data, loading } = useApi<{ items: Payment[]; total_amount: number }>(`/api/payments/suppliers?supplier_id=${supplierId}&limit=9999`);
  const payments = data?.items || [];
  const totalPaid = data?.total_amount || 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">📋 كشف الحساب</h2>
        <button onClick={onPay} className="btn-primary text-sm">+ سداد جديد</button>
      </div>

      {loading ? <div className="card text-center py-8 text-gray-500">⏳ جاري التحميل...</div> : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3 text-right">التاريخ</th>
                <th className="p-3 text-right">الخزينة</th>
                <th className="p-3 text-right">طريقة الدفع</th>
                <th className="p-3 text-right">البيان</th>
                <th className="p-3 text-right">المبلغ</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 text-xs">{formatDate(p.payment_date)}</td>
                  <td className="p-3 text-xs text-gray-600">{p.treasury?.name || '—'}</td>
                  <td className="p-3 text-xs">{p.payment_method}</td>
                  <td className="p-3">{p.notes || 'سداد لمورد'}</td>
                  <td className="p-3 font-mono font-bold text-red-700">{formatEGP(p.amount)}</td>
                </tr>
              ))}
              {payments.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-gray-400">لا توجد حركات</td></tr>}
            </tbody>
            {payments.length > 0 && (
              <tfoot>
                <tr className="bg-gray-100 font-bold">
                  <td colSpan={4} className="p-3 text-left">الإجمالي:</td>
                  <td className="p-3 font-mono">{formatEGP(totalPaid)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}

/* ============================================
   قسم فواتير المورد
============================================ */
function InvoicesSection({ supplierId }: { supplierId: string }) {
  const { data, loading } = useApi<{ items: PurchaseInvoice[] }>(`/api/purchases/invoices?supplier_id=${supplierId}`);
  const invoices = data?.items || [];

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold">📥 فواتير المورد</h2>
      {loading ? <div className="card text-center py-8 text-gray-500">⏳ جاري التحميل...</div> : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3 text-right">رقم</th>
                <th className="p-3 text-right">التاريخ</th>
                <th className="p-3 text-right">الأصناف</th>
                <th className="p-3 text-right">الإجمالي</th>
                <th className="p-3 text-right">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 font-mono font-bold">#{inv.purchase_number}</td>
                  <td className="p-3 text-xs">{formatDate(inv.purchase_date)}</td>
                  <td className="p-3 text-center">{inv._count?.items ?? 0}</td>
                  <td className="p-3 font-mono font-bold">{formatEGP(inv.total_amount)}</td>
                  <td className="p-3"><span className="badge bg-green-100 text-green-800">{inv.status}</span></td>
                </tr>
              ))}
              {invoices.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-gray-400">لا توجد فواتير</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ============================================
   قسم شيكات المورد
============================================ */
function ChecksSection({ supplierId, onAdd }: { supplierId: string; onAdd: () => void }) {
  const { data, loading, refetch } = useApi<{ items: Check[]; total: number }>("/api/checks");
  const checks = (data?.items || []).filter(c => c.direction === 'outgoing').sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">🧾 شيكات المورد</h2>
        <button onClick={onAdd} className="btn-primary text-sm">+ إضافة شيك</button>
      </div>
      {loading ? <div className="card text-center py-8 text-gray-500">⏳ جاري التحميل...</div> : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3 text-right">البنك</th>
                <th className="p-3 text-right">رقم الشيك</th>
                <th className="p-3 text-right">الاستحقاق</th>
                <th className="p-3 text-right">المبلغ</th>
                <th className="p-3 text-right">الحالة</th>
                <th className="p-3 text-right">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {checks.map(c => (
                <tr key={c.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 text-xs">{c.bank_name || '—'}</td>
                  <td className="p-3 font-mono text-xs">{c.check_number || '—'}</td>
                  <td className="p-3 text-xs font-semibold">{formatDate(c.due_date)}</td>
                  <td className="p-3 font-mono font-bold">{formatEGP(c.amount)}</td>
                  <td className="p-3"><span className={`badge ${CHECK_STATUS_STYLES[c.status] || "bg-gray-100"}`}>{c.status}</span></td>
                  <td className="p-3">
                    {c.status === 'تحت التحصيل' && (
                      <button onClick={() => settleCheck(c.id, refetch)} className="text-xs px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700">تم السداد</button>
                    )}
                  </td>
                </tr>
              ))}
              {checks.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-gray-400">لا توجد شيكات</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

async function settleCheck(id: string, refetch: () => void) {
  if (!confirm('سيتم تسديد الشيك وتسجيل سداد للمورد تلقائياً. متابعة؟')) return;
  const res = await fetch('/api/checks', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, status: 'تم الصرف' }),
  });
  const json = await res.json();
  if (!res.ok) { alert('❌ ' + (json?.error?.message || json?.error?.code || 'حدث خطأ')); return; }
  alert('✅ تم تسديد الشيك وتسجيل سداد للمورد');
  refetch();
}

/* ============================================
   نموذج السداد السريع
============================================ */
function PayForm({ supplierId, onClose, onSaved }: { supplierId: string; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ amount: 0, payment_method: 'نقدي', treasury_id: '', payment_date: '', notes: '' });
  const { mutate, loading } = useApiMutation();
  const [treasuries, setTreasuries] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    fetch('/api/treasury').then(r => r.json()).then(j => setTreasuries(j.data?.items || [])).catch(() => {});
  }, []);

  async function save() {
    if (!f.treasury_id || f.amount <= 0) { alert('❌ أكمل البيانات'); return; }
    const { error } = await mutate('POST', '/api/payments/suppliers', { ...f, supplier_id: supplierId });
    if (error) { alert('❌ ' + error); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-3">
        <h2 className="text-xl font-bold">+ سداد للمورد</h2>
        <div><label className="text-sm font-medium block mb-1">المبلغ *</label><input type="number" step="0.01" className="input-field" value={f.amount} onChange={(e) => setF({ ...f, amount: parseFloat(e.target.value) || 0 })} autoFocus /></div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium block mb-1">طريقة الدفع</label>
            <select className="input-field" value={f.payment_method} onChange={(e) => setF({ ...f, payment_method: e.target.value })}>
              {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">الخزينة *</label>
            <select className="input-field" value={f.treasury_id} onChange={(e) => setF({ ...f, treasury_id: e.target.value })}>
              <option value="">اختر...</option>
              {treasuries.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>
        <div><label className="text-sm font-medium block mb-1">التاريخ</label><input type="date" className="input-field" value={f.payment_date} onChange={(e) => setF({ ...f, payment_date: e.target.value })} /></div>
        <div><label className="text-sm font-medium block mb-1">ملاحظات</label><input className="input-field" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
        <div className="flex gap-2 pt-3"><button onClick={save} disabled={loading} className="btn-primary flex-1">{loading ? 'جاري الحفظ...' : 'حفظ'}</button><button onClick={onClose} className="btn-secondary">إلغاء</button></div>
      </div>
    </div>
  );
}

/* ============================================
   نموذج تعديل بيانات المورد
============================================ */
function EditForm({ supplier, onClose, onSaved }: { supplier: SupplierDetail; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: supplier.name,
    phone: supplier.phone || '',
    address: supplier.address || '',
    opening_balance: supplier.opening_balance,
    notes: supplier.notes || '',
  });
  const { mutate, loading } = useApiMutation();

  async function save() {
    if (!f.name.trim()) { alert('❌ اسم المورد مطلوب'); return; }
    const { error } = await mutate('PATCH', `/api/suppliers/${supplier.id}`, {
      name: f.name.trim(),
      phone: f.phone || null,
      address: f.address || null,
      opening_balance: Number(f.opening_balance) || 0,
      notes: f.notes || null,
    });
    if (error) { alert('❌ ' + error); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-3">
        <h2 className="text-xl font-bold">✏️ تعديل بيانات المورد</h2>
        <div><label className="text-sm font-medium block mb-1">اسم المورد *</label><input className="input-field" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></div>
        <div><label className="text-sm font-medium block mb-1">الهاتف</label><input className="input-field" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
        <div><label className="text-sm font-medium block mb-1">العنوان</label><input className="input-field" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></div>
        <div>
          <label className="text-sm font-medium block mb-1">الرصيد الافتتاحي</label>
          <input type="number" step="0.01" className="input-field" value={f.opening_balance} onChange={(e) => setF({ ...f, opening_balance: parseFloat(e.target.value) || 0 })} />
          <p className="text-xs text-orange-600 mt-1">⚠️ تعديل الرصيد الافتتاحي يغيّر الرصيد الحالي مباشرة</p>
        </div>
        <div><label className="text-sm font-medium block mb-1">ملاحظات</label><textarea className="input-field" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
        <div className="flex gap-2 pt-3"><button onClick={save} disabled={loading} className="btn-primary flex-1">{loading ? 'جاري الحفظ...' : 'حفظ التعديلات'}</button><button onClick={onClose} className="btn-secondary">إلغاء</button></div>
      </div>
    </div>
  );
}

/* ============================================
   نموذج إضافة شيك سريع
============================================ */
function CheckForm({ supplierId, onClose, onSaved }: { supplierId: string; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ bank_name: '', check_number: '', amount: 0, issue_date: '', due_date: '', notes: '' });
  const { mutate, loading } = useApiMutation();

  async function save() {
    if (!f.amount || f.amount <= 0 || !f.issue_date || !f.due_date) { alert('❌ أكمل البيانات'); return; }
    const { error } = await mutate('POST', '/api/checks', { ...f, direction: 'outgoing', supplier_id: supplierId });
    if (error) { alert('❌ ' + error); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-3">
        <h2 className="text-xl font-bold">+ إضافة شيك للمورد</h2>
        <div><label className="text-sm font-medium block mb-1">المبلغ *</label><input type="number" step="0.01" className="input-field" value={f.amount} onChange={(e) => setF({ ...f, amount: parseFloat(e.target.value) || 0 })} autoFocus /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-sm font-medium block mb-1">البنك</label><input className="input-field" value={f.bank_name} onChange={(e) => setF({ ...f, bank_name: e.target.value })} /></div>
          <div><label className="text-sm font-medium block mb-1">رقم الشيك</label><input className="input-field" value={f.check_number} onChange={(e) => setF({ ...f, check_number: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-sm font-medium block mb-1">تاريخ الإصدار *</label><input type="date" className="input-field" value={f.issue_date} onChange={(e) => setF({ ...f, issue_date: e.target.value })} /></div>
          <div><label className="text-sm font-medium block mb-1">تاريخ الاستحقاق *</label><input type="date" className="input-field" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></div>
        </div>
        <div><label className="text-sm font-medium block mb-1">ملاحظات</label><input className="input-field" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
        <div className="flex gap-2 pt-3"><button onClick={save} disabled={loading} className="btn-primary flex-1">{loading ? 'جاري الحفظ...' : 'حفظ'}</button><button onClick={onClose} className="btn-secondary">إلغاء</button></div>
      </div>
    </div>
  );
}
