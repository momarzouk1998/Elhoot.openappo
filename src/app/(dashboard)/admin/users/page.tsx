"use client";
import { useState, useEffect } from "react";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { formatDate } from "@/lib/format";
import { useCurrentUser } from "@/hooks/useCurrentUser";

interface User {
  id: number; username: string; full_name: string; phone: string | null; whatsapp: string | null;
  email: string | null; role: string; can_see_cost: boolean; is_active: boolean;
  last_login_at: string | null;
  default_store: { id: string; name: string } | null;
}
interface Store { id: string; name: string; }

const ROLES = [
  { value: "admin", label: "مدير عام" },
  { value: "manager", label: "مدير" },
  { value: "accountant", label: "محاسب" },
  { value: "rep", label: "مندوب" },
];

export default function AdminUsersPage() {
  const { profile } = useCurrentUser();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<User | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const { data, loading, refetch } = useApi<{ items: User[]; total: number }>('/api/users');
  const { mutate, loading: saving } = useApiMutation();

  const users = (data?.items || []).filter(u => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.full_name.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q) ||
      (u.phone || "").includes(q) ||
      (u.email || "").toLowerCase().includes(q)
    );
  });

  async function toggleActive(u: User) {
    const action = u.is_active ? 'تعطيل' : 'تفعيل';
    if (!confirm(`هل تريد ${action} المستخدم "${u.full_name}"؟`)) return;
    const { error } = await mutate('PATCH', `/api/users/${u.id}`, { is_active: !u.is_active });
    if (error) { alert('❌ ' + error); return; }
    alert(`✅ تم ${action} المستخدم`);
    refetch();
  }

  async function deleteUser(u: User) {
    if (u.id === profile?.id) {
      alert('❌ لا يمكن حذف حسابك الخاص');
      return;
    }
    if (!confirm(`⚠️ هل تريد حذف المستخدم "${u.full_name}"؟\n\nهذا الإجراء لا يمكن التراجع عنه!`)) return;
    const { error } = await mutate('DELETE', `/api/users/${u.id}`);
    if (error) { alert('❌ ' + error); return; }
    alert('✅ تم حذف المستخدم');
    refetch();
  }

  if (profile && profile.role !== 'admin') {
    return (
      <div className="card p-8 text-center">
        <p className="text-red-600 font-bold">🚫 هذه الصفحة للمدير العام فقط</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-650">👤 المستخدمين</h1>
          <p className="text-sm text-gray-500">{data?.total ?? '...'} مستخدم</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary">+ مستخدم جديد</button>
      </div>

      <div className="card">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 ابحث بالاسم أو الهاتف..." className="input-field" autoFocus />
      </div>

      {loading ? <div className="card text-center py-12 text-gray-500">⏳ جاري التحميل...</div> : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3 text-right">الاسم</th>
                <th className="p-3 text-right">اسم المستخدم</th>
                <th className="p-3 text-right">الدور</th>
                <th className="p-3 text-right">الهاتف</th>
                <th className="p-3 text-right">المتجر الافتراضي</th>
                <th className="p-3 text-right">الحالة</th>
                <th className="p-3 text-right">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 font-semibold">{u.full_name}</td>
                  <td className="p-3 text-xs font-mono">{u.username}</td>
                  <td className="p-3 text-xs">
                    <span className={`badge ${
                      u.role === 'admin' ? 'bg-red-100 text-red-800' :
                      u.role === 'manager' ? 'bg-purple-100 text-purple-800' :
                      u.role === 'accountant' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {ROLES.find(r => r.value === u.role)?.label || u.role}
                    </span>
                    {u.can_see_cost && <span className="badge bg-green-100 text-green-800 mr-1">يرى التكلفة</span>}
                  </td>
                  <td className="p-3 text-sm font-mono">{u.phone || '—'}</td>
                  <td className="p-3 text-xs">{u.default_store?.name || '—'}</td>
                  <td className="p-3">
                    <span className={`badge ${u.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {u.is_active ? '✓ نشط' : '✕ معطل'}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <button onClick={() => setEditing(u)} className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200">✏️</button>
                      {profile && u.id !== profile.id && (
                        <>
                          <button onClick={() => toggleActive(u)} className="text-xs px-2 py-1 rounded bg-yellow-50 hover:bg-yellow-100 text-yellow-700">
                            {u.is_active ? '🚫' : '✓'}
                          </button>
                          <button onClick={() => deleteUser(u)} className="text-xs px-2 py-1 rounded bg-red-50 hover:bg-red-100 text-red-700">
                            🗑️
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && <tr><td colSpan={7} className="p-12 text-center text-gray-400">لا يوجد مستخدمين</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {(showAdd || editing) && (
        <UserForm
          user={editing}
          onClose={() => { setShowAdd(false); setEditing(null); }}
          onSaved={() => { setShowAdd(false); setEditing(null); refetch(); }}
        />
      )}
    </div>
  );
}

function UserForm({ user, onClose, onSaved }: { user: User | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    username: user?.username || "",
    full_name: user?.full_name || "",
    phone: user?.phone || "",
    whatsapp: user?.whatsapp || "",
    email: user?.email || "",
    role: user?.role || "rep",
    can_see_cost: user?.can_see_cost || false,
    default_store_id: user?.default_store?.id || "",
    is_active: user?.is_active !== false,
    password: "",
  });
  const { mutate, loading } = useApiMutation();
  const { data: storesData } = useApi<{ items: Store[] }>('/api/stores');
  const stores = storesData?.items || [];

  async function save() {
    if (!f.username.trim()) { alert('❌ اسم المستخدم مطلوب'); return; }
    if (!f.full_name.trim()) { alert('❌ الاسم الكامل مطلوب'); return; }
    if (!user && !f.password) { alert('❌ كلمة المرور مطلوبة للمستخدم الجديد'); return; }
    if (f.password && f.password.length < 4) { alert('❌ كلمة المرور قصيرة جداً (4 حروف على الأقل)'); return; }

    const url = user ? `/api/users/${user.id}` : '/api/users';
    const method = user ? 'PATCH' : 'POST';
    const payload: any = { ...f };
    if (!f.password) delete payload.password;
    const { error } = await mutate(method, url, payload);
    if (error) { alert('❌ ' + error); return; }
    alert(user ? '✅ تم تعديل المستخدم' : '✅ تم إضافة المستخدم');
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-3">
        <h2 className="text-lg font-bold">{user ? '✏️ تعديل مستخدم' : '👤 + مستخدم جديد'}</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium block mb-1">الاسم الكامل *</label>
            <input className="input-field" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} autoFocus />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">اسم المستخدم *</label>
            <input className="input-field" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} disabled={!!user} />
            {user && <div className="text-[10px] text-gray-500 mt-1">لا يمكن تغيير اسم المستخدم</div>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium block mb-1">الهاتف</label>
            <input className="input-field" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">واتساب</label>
            <input className="input-field" value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">البريد الإلكتروني</label>
          <input type="email" className="input-field" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">كلمة المرور {user && '(اتركها فارغة للحفاظ على الحالية)'}</label>
          <input type="password" className="input-field" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder={user ? '••••••' : 'كلمة المرور'} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium block mb-1">الدور *</label>
            <select className="input-field" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">المتجر الافتراضي</label>
            <select className="input-field" value={f.default_store_id} onChange={(e) => setF({ ...f, default_store_id: e.target.value })}>
              <option value="">— بدون —</option>
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-3 pt-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.can_see_cost} onChange={(e) => setF({ ...f, can_see_cost: e.target.checked })} />
            يرى سعر التكلفة
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} />
            نشط
          </label>
        </div>
        <div className="flex gap-2 pt-2">
          <button onClick={save} disabled={loading} className="btn-primary flex-1">{loading ? 'جاري الحفظ...' : 'حفظ'}</button>
          <button onClick={onClose} className="btn-secondary">إلغاء</button>
        </div>
      </div>
    </div>
  );
}
