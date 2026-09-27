"use client";

import { useState } from "react";
import Link from "next/link";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { formatEGP } from "@/lib/format";
import * as Lucide from "lucide-react";

interface Treasury {
  id: string;
  name: string;
  type: string;
  current_balance: number;
  opening_balance: number;
  notes: string | null;
  is_active: boolean;
  assigned_user?: { full_name: string } | null;
}

export default function TreasuryPage() {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Treasury | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  // Direct Transaction Modal State
  const [directTx, setDirectTx] = useState<{ type: "deposit" | "withdrawal"; treasury?: Treasury } | null>(null);
  const [txAmount, setTxAmount] = useState("");
  const [txTitle, setTxTitle] = useState("");
  const [txDate, setTxDate] = useState(new Date().toISOString().slice(0, 10));
  const [txNotes, setTxNotes] = useState("");
  const [txSubmitting, setTxSubmitting] = useState(false);

  const { data, loading, refetch } = useApi<{ items: Treasury[]; total: number }>("/api/treasury");
  const { mutate } = useApiMutation();

  const treasuries = (data?.items || []).filter((t) => t.name.includes(search));
  const totalBalance = treasuries.reduce((s, t) => s + Number(t.current_balance), 0);
  const totalOpening = treasuries.reduce((s, t) => s + Number(t.opening_balance), 0);

  async function deleteTreasury(t: Treasury) {
    if (!confirm(`هل تريد حذف خزينة "${t.name}"؟`)) return;
    const { error } = await mutate("DELETE", `/api/treasury/${t.id}`);
    if (error) {
      alert("❌ " + error);
      return;
    }
    alert("✅ تم الحذف");
    refetch();
  }

  async function recalculateAll() {
    if (
      !confirm(
        "⚠️ هل تريد إعادة حساب وتصفير أرصدة جميع الخزائن تلقائياً مطابقةً مع المعاملات الفعلية المسجلة بالسيستم؟"
      )
    )
      return;
    try {
      setRecalculating(true);
      const res = await fetch("/api/treasury/recalculate", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        alert("❌ " + (json?.error?.message || "حدث خطأ أثناء إعادة الحساب"));
        return;
      }
      alert("✅ تم إعادة حساب وتصفير أرصدة الخزائن بنجاح");
      refetch();
    } catch {
      alert("❌ حدث خطأ في النظام");
    } finally {
      setRecalculating(false);
    }
  }

  async function handleSaveDirectTx(e: React.FormEvent) {
    e.preventDefault();
    if (!directTx?.treasury?.id) return;
    if (!txAmount || Number(txAmount) <= 0) return alert("يرجى إدخال مبلغ صحيح أكبر من الصفر");

    setTxSubmitting(true);
    try {
      const res = await fetch("/api/treasury/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          treasury_id: directTx.treasury.id,
          type: directTx.type,
          amount: Number(txAmount),
          transaction_date: txDate,
          title: txTitle.trim(),
          notes: txNotes.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        alert("❌ " + (json?.error?.message || "فشل تسجيل الحركة"));
        return;
      }

      alert("✅ " + json.message);
      setDirectTx(null);
      setTxAmount("");
      setTxTitle("");
      setTxNotes("");
      refetch();
    } catch {
      alert("❌ حدث خطأ غير متوقع");
    } finally {
      setTxSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-800 flex items-center gap-2">
            <span>🏦</span>
            <span>الخزائن والمعاملات النقدية</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            إدارة الخزائن، كشوفات الحساب، تسجيل الإيداع والسحب النقدي المباشر
          </p>
        </div>

        <div className="flex gap-2 flex-wrap items-center">
          <button
            onClick={recalculateAll}
            disabled={recalculating}
            className="px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all cursor-pointer border border-slate-200 disabled:opacity-50"
            title="إعادة تصفير وحساب الأرصدة من المعاملات المسجلة"
          >
            <Lucide.RotateCcw className={`w-4 h-4 ${recalculating ? "animate-spin text-amber-600" : ""}`} />
            <span>{recalculating ? "جاري إعادة الحساب..." : "تصفير/إعادة حساب الأرصدة"}</span>
          </button>

          <button
            onClick={() => setShowAdd(true)}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs sm:text-sm flex items-center gap-1.5 transition-all shadow-md shadow-blue-600/20 cursor-pointer"
          >
            <Lucide.Plus className="w-4 h-4" />
            <span>خزينة جديدة</span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-2">
        <Lucide.Search className="w-5 h-5 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث باسم الخزينة أو العهدة..."
          className="w-full bg-transparent border-none outline-none text-sm font-semibold text-slate-800 placeholder:text-slate-400"
        />
        {search && (
          <button onClick={() => setSearch("")} className="text-xs text-slate-400 hover:text-slate-600 font-bold px-2">
            مسح
          </button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-500">إجمالي الأرصدة الحالية بالخزائن</div>
            <div className="text-2xl md:text-3xl font-black text-emerald-600 font-mono mt-1">
              {formatEGP(totalBalance)} <span className="text-xs font-bold text-slate-500">ج.م</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl shadow-inner">
            💰
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-500">إجمالي الأرصدة الافتتاحية</div>
            <div className="text-2xl md:text-3xl font-black text-slate-700 font-mono mt-1">
              {formatEGP(totalOpening)} <span className="text-xs font-bold text-slate-500">ج.م</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center text-xl shadow-inner">
            🏛️
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-500">عدد الخزائن النشطة</div>
            <div className="text-2xl md:text-3xl font-black text-blue-600 font-mono mt-1">{treasuries.length}</div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-xl shadow-inner">
            🏦
          </div>
        </div>
      </div>

      {/* Treasuries Grid */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 font-bold">
          ⏳ جاري تحميل بيانات الخزائن...
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {treasuries.map((t) => (
            <div
              key={t.id}
              className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-all space-y-4 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <span className="inline-block px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-bold mb-1">
                      {t.type}
                    </span>
                    <h3 className="font-extrabold text-lg text-slate-900">{t.name}</h3>
                    {t.assigned_user && (
                      <div className="text-xs text-blue-700 font-semibold mt-1 flex items-center gap-1">
                        <span>👤 المسئول:</span>
                        <span>{t.assigned_user.full_name}</span>
                      </div>
                    )}
                    {t.notes && <div className="text-xs text-slate-500 mt-1 line-clamp-2">📝 {t.notes}</div>}
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center text-2xl shrink-0">
                    🏦
                  </div>
                </div>

                <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500">الرصيد الحالي:</span>
                  <span className="text-xl font-black text-emerald-600 font-mono">
                    {formatEGP(t.current_balance)} <span className="text-xs font-bold text-slate-500">ج</span>
                  </span>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100">
                {/* Statement Link Button */}
                <Link
                  href={`/treasury/${t.id}`}
                  className="w-full py-2.5 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-colors border border-blue-200 shadow-sm"
                >
                  <Lucide.FileText className="w-4 h-4" />
                  <span>عرض كشف حساب الخزينة التفصيلي</span>
                </Link>

                {/* Direct Action Buttons */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      setDirectTx({ type: "deposit", treasury: t });
                      setTxTitle("توريد نقدية مباشر / تغذية خزينة");
                    }}
                    className="py-1.5 px-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center justify-center gap-1 border border-emerald-200 transition-colors cursor-pointer"
                  >
                    <Lucide.PlusCircle className="w-3.5 h-3.5" />
                    <span>إيداع نقدية</span>
                  </button>

                  <button
                    onClick={() => {
                      setDirectTx({ type: "withdrawal", treasury: t });
                      setTxTitle("سحب نقدي مباشر / عهدة");
                    }}
                    className="py-1.5 px-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs flex items-center justify-center gap-1 border border-rose-200 transition-colors cursor-pointer"
                  >
                    <Lucide.MinusCircle className="w-3.5 h-3.5" />
                    <span>سحب نقدية</span>
                  </button>
                </div>

                {/* Edit & Delete */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setEditing(t)}
                    className="flex-1 text-xs py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                  >
                    <Lucide.Pencil className="w-3.5 h-3.5" />
                    <span>تعديل الرصيد/البيانات</span>
                  </button>
                  <button
                    onClick={() => deleteTreasury(t)}
                    className="text-xs p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors font-bold cursor-pointer"
                    title="حذف الخزينة"
                  >
                    <Lucide.Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {treasuries.length === 0 && (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center text-slate-400 font-semibold col-span-full">
              لا توجد خزائن مسجلة تطابق البحث
            </div>
          )}
        </div>
      )}

      {/* Direct Deposit / Withdrawal Modal */}
      {directTx && directTx.treasury && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setDirectTx(null)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <span>{directTx.type === "deposit" ? "🟢 إيداع نقدية مباشر" : "🔴 سحب نقدي مباشر"}</span>
                </h3>
                <span className="text-xs text-blue-700 font-bold">الخزينة: {directTx.treasury.name}</span>
              </div>
              <button
                onClick={() => setDirectTx(null)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveDirectTx} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">المبلغ المطلوب (ج.م) *</label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="0.00"
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono font-bold text-base focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">تاريخ الحركة</label>
                <input
                  type="date"
                  required
                  value={txDate}
                  onChange={(e) => setTxDate(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">البيان / العنوان</label>
                <input
                  type="text"
                  placeholder={directTx.type === "deposit" ? "مثال: تغذية خزينة من حساب البنك" : "مثال: سحب عهدة شراء"}
                  value={txTitle}
                  onChange={(e) => setTxTitle(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">ملاحظات إضافية</label>
                <textarea
                  rows={2}
                  placeholder="أي تفاصيل أخرى..."
                  value={txNotes}
                  onChange={(e) => setTxNotes(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="submit"
                  disabled={txSubmitting}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-white font-bold text-xs transition-all shadow-md cursor-pointer ${
                    directTx.type === "deposit"
                      ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20"
                      : "bg-rose-600 hover:bg-rose-700 shadow-rose-600/20"
                  }`}
                >
                  {txSubmitting ? "جاري الحفظ..." : directTx.type === "deposit" ? "تأكيد الإيداع (+)" : "تأكيد السحب (-)"}
                </button>
                <button
                  type="button"
                  onClick={() => setDirectTx(null)}
                  className="py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {(showAdd || editing) && (
        <TreasuryForm
          treasury={editing}
          onClose={() => {
            setShowAdd(false);
            setEditing(null);
          }}
          onSaved={() => {
            setShowAdd(false);
            setEditing(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}

const TYPES = ["رئيسية", "عهدة عربية", "إدارة", "فودافون كاش", "بنكية"];

function TreasuryForm({
  treasury,
  onClose,
  onSaved,
}: {
  treasury: Treasury | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    name: treasury?.name || "",
    type: treasury?.type || "رئيسية",
    opening_balance: treasury ? Number(treasury.opening_balance) : 0,
    current_balance: treasury ? Number(treasury.current_balance) : 0,
    notes: treasury?.notes || "",
    is_active: treasury?.is_active !== false,
  });
  const { mutate, loading } = useApiMutation();

  async function save() {
    if (!f.name.trim()) {
      alert("❌ اسم الخزينة مطلوب");
      return;
    }
    const url = treasury ? `/api/treasury/${treasury.id}` : "/api/treasury";
    const method = treasury ? "PATCH" : "POST";
    const { error } = await mutate(method, url, f);
    if (error) {
      alert("❌ " + error);
      return;
    }
    alert(treasury ? "✅ تم تعديل الخزينة" : "✅ تم إضافة الخزينة");
    onSaved();
  }

  async function recalculateThis() {
    if (!treasury) return;
    const { error } = await mutate("PATCH", `/api/treasury/${treasury.id}`, { recalculate: true });
    if (error) {
      alert("❌ " + error);
      return;
    }
    alert("✅ تم إعادة حساب رصيد هذه الخزينة بنجاح");
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3">
        <h2 className="text-lg font-bold">{treasury ? "✏️ تعديل وتصفير الخزينة" : "🏦 + خزينة جديدة"}</h2>

        <div>
          <label className="text-sm font-medium block mb-1">اسم الخزينة *</label>
          <input className="input-field" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
        </div>

        <div>
          <label className="text-sm font-medium block mb-1">النوع</label>
          <select className="input-field" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium block mb-1">الرصيد الافتتاحي</label>
            <input
              type="number"
              step="0.01"
              className="input-field font-mono"
              value={f.opening_balance}
              onChange={(e) => setF({ ...f, opening_balance: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1 text-emerald-800 font-bold">الرصيد الحالي *</label>
            <input
              type="number"
              step="0.01"
              className="input-field font-mono font-bold text-emerald-700 bg-emerald-50 border-emerald-300"
              value={f.current_balance}
              onChange={(e) => setF({ ...f, current_balance: parseFloat(e.target.value) || 0 })}
            />
          </div>
        </div>

        {treasury && (
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setF({ ...f, current_balance: 0 })}
              className="text-xs px-2.5 py-1.5 bg-amber-100 text-amber-900 rounded-lg hover:bg-amber-200 font-bold cursor-pointer flex-1"
            >
              ⚡ تصفير الحالي (0 ج)
            </button>
            <button
              type="button"
              onClick={recalculateThis}
              className="text-xs px-2.5 py-1.5 bg-blue-100 text-blue-900 rounded-lg hover:bg-blue-200 font-bold cursor-pointer flex-1"
            >
              🔄 إعادة حساب من الحركات
            </button>
          </div>
        )}

        <div>
          <label className="text-sm font-medium block mb-1">ملاحظات</label>
          <input className="input-field" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </div>

        <div className="flex items-center gap-2">
          <input
            id="active"
            type="checkbox"
            checked={f.is_active}
            onChange={(e) => setF({ ...f, is_active: e.target.checked })}
          />
          <label htmlFor="active" className="text-sm">
            نشطة
          </label>
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={save} disabled={loading} className="btn-primary flex-1">
            {loading ? "جاري الحفظ..." : "حفظ التعديلات"}
          </button>
          <button onClick={onClose} className="btn-secondary">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}
