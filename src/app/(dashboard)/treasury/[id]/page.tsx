"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { formatEGP, formatDate } from "@/lib/format";
import * as Lucide from "lucide-react";

interface StatementItem {
  id: string;
  date: string;
  type: "in" | "out";
  category: string;
  label: string;
  party: string;
  amountIn: number;
  amountOut: number;
  balance: number;
  notes: string;
  user: string;
}

interface StatementData {
  treasury: {
    id: string;
    name: string;
    type: string;
    opening_balance: number;
    current_balance: number;
    calculated_balance: number;
    assigned_user: string | null;
    notes: string | null;
  };
  summary: {
    opening_balance: number;
    total_in: number;
    total_out: number;
    current_balance: number;
    calculated_balance: number;
    period_in: number;
    period_out: number;
    period_net: number;
    movement_count: number;
    total_count: number;
  };
  items: StatementItem[];
}

export default function TreasuryStatementPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [data, setData] = useState<StatementData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  // Filters
  const [search, setSearch] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<"all" | "in" | "out">("all");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  // Direct Transaction Modal
  const [showTxModal, setShowTxModal] = useState<"deposit" | "withdrawal" | null>(null);
  const [txAmount, setTxAmount] = useState<string>("");
  const [txTitle, setTxTitle] = useState<string>("");
  const [txDate, setTxDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [txNotes, setTxNotes] = useState<string>("");
  const [txSubmitting, setTxSubmitting] = useState<boolean>(false);
  const [copiedSuccess, setCopiedSuccess] = useState<boolean>(false);

  const loadStatement = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams();
      if (fromDate) q.set("from_date", fromDate);
      if (toDate) q.set("to_date", toDate);
      if (typeFilter !== "all") q.set("type", typeFilter);
      if (search.trim()) q.set("search", search.trim());

      const res = await fetch(`/api/treasury/${id}/statement?${q.toString()}`);
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json?.error?.message || "فشل تحميل كشف الخزينة");
        return;
      }
      setData(json.data);
    } catch (e: any) {
      setError("حدث خطأ أثناء تحميل كشف الحساب");
    } finally {
      setLoading(false);
    }
  }, [id, fromDate, toDate, typeFilter, search]);

  useEffect(() => {
    loadStatement();
  }, [loadStatement]);

  // Handle Save Direct Transaction from inside Statement page
  async function handleSaveDirectTx(e: React.FormEvent) {
    e.preventDefault();
    if (!showTxModal) return;
    if (!txAmount || Number(txAmount) <= 0) return alert("يرجى إدخال مبلغ صحيح أكبر من الصفر");

    setTxSubmitting(true);
    try {
      const res = await fetch("/api/treasury/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          treasury_id: id,
          type: showTxModal,
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
      setShowTxModal(null);
      setTxAmount("");
      setTxTitle("");
      setTxNotes("");
      loadStatement();
    } catch {
      alert("❌ حدث خطأ غير متوقع");
    } finally {
      setTxSubmitting(false);
    }
  }

  // Generate and copy WhatsApp Formatted Statement
  function copyWhatsAppStatement() {
    if (!data) return;

    const t = data.treasury;
    const s = data.summary;
    const fPeriod = fromDate || toDate ? `من ${fromDate || 'البداية'} إلى ${toDate || 'الآن'}` : "كامل الفترة";

    let text = `🐳 *شركة الحوت للأدوات واللوحات الكهربائية*\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n`;
    text += `🏦 *كشف حساب خزينة:* ${t.name} (${t.type})\n`;
    if (t.assigned_user) text += `👤 *المسئول:* ${t.assigned_user}\n`;
    text += `📅 *الفترة:* ${fPeriod}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n`;
    text += `💵 *الرصيد الافتتاحي:* ${formatEGP(s.opening_balance)} ج.م\n`;
    text += `🟢 *إجمالي الوارد (+):* ${formatEGP(s.period_in)} ج.م\n`;
    text += `🔴 *إجمالي المنصرف (-):* ${formatEGP(s.period_out)} ج.م\n`;
    text += `⚖️ *صافي حركة الفترة:* ${formatEGP(s.period_net)} ج.م\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n`;
    text += `💰 *الرصيد الحالي بالخزينة:* ${formatEGP(t.current_balance)} ج.م\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n`;
    const items = data.items || [];
    text += `📋 *سجل حركات الخزينة بالتفصيل (${items.length} حركة):*\n`;

    if (items.length === 0) {
      text += `• لا توجد حركات مسجلة بهذه الفترة\n`;
    } else {
      items.forEach((item, idx) => {
        const sign = item.type === "in" ? "🟢 وارد: +" : "🔴 صادر: -";
        const amt = formatEGP(item.type === "in" ? item.amountIn : item.amountOut);
        const dStr = item.date ? item.date.slice(0, 10) : "";
        const balStr = `(رصيد: ${formatEGP(item.balance)} ج)`;
        text += `${idx + 1}. 📅 ${dStr} | ${sign}${amt} ج.م | ${balStr}\n   📝 البيان: ${item.label}\n`;
        if (item.notes && item.notes !== item.label) {
          text += `   💬 ملاحظات: ${item.notes}\n`;
        }
        text += `──────────────────\n`;
      });
    }

    text += `━━━━━━━━━━━━━━━━━━━━\n`;
    text += `⏰ تم استخراج التقرير: ${new Date().toLocaleString("ar-EG")}\n`;

    navigator.clipboard.writeText(text);
    setCopiedSuccess(true);
    setTimeout(() => setCopiedSuccess(false), 3000);
  }

  return (
    <div className="space-y-6 pb-16">
      {/* Breadcrumb & Navigation */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Link
          href="/treasury"
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
        >
          <Lucide.ArrowRight className="w-4 h-4" />
          <span>العودة لقائمة الخزائن</span>
        </Link>

        {/* Quick action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              setShowTxModal("deposit");
              setTxTitle("توريد نقدية مباشر / تغذية خزينة");
            }}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <Lucide.PlusCircle className="w-4 h-4" />
            <span>إيداع نقدية (+)</span>
          </button>

          <button
            onClick={() => {
              setShowTxModal("withdrawal");
              setTxTitle("سحب نقدي مباشر / عهدة");
            }}
            className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <Lucide.MinusCircle className="w-4 h-4" />
            <span>سحب نقدية (-)</span>
          </button>

          <button
            onClick={copyWhatsAppStatement}
            className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            title="نسخ كشف حساب منسق وجاهز للإرسال على الواتساب"
          >
            {copiedSuccess ? <Lucide.Check className="w-4 h-4" /> : <Lucide.Share2 className="w-4 h-4" />}
            <span>{copiedSuccess ? "تم نسخ تقرير الواتساب! ✓" : "نسخ للواتساب 📲"}</span>
          </button>

          <a
            href={`/print/statement/treasury/${id}?from_date=${fromDate}&to_date=${toDate}&type=${typeFilter}`}
            target="_blank"
            rel="noreferrer"
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <Lucide.Printer className="w-4 h-4" />
            <span>طباعة / تصدير PDF</span>
          </a>
        </div>
      </div>

      {/* Main Header Card */}
      <div className="bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-600 border border-amber-500/20 flex items-center justify-center text-3xl shadow-sm">
            🏦
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold text-xs">
                {data?.treasury?.type || "خزينة"}
              </span>
              <h1 className="text-xl md:text-2xl font-black text-slate-900">{data?.treasury?.name || "..."}</h1>
            </div>
            {data?.treasury?.assigned_user && (
              <p className="text-xs text-blue-700 font-bold mt-1">👤 المسئول: {data.treasury.assigned_user}</p>
            )}
            {data?.treasury?.notes && <p className="text-xs text-slate-500 mt-0.5">📝 {data.treasury.notes}</p>}
          </div>
        </div>

        {/* Current Balance Display */}
        <div className="bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-md border border-slate-800 text-left sm:text-right">
          <div className="text-[11px] font-bold text-slate-400">الرصيد الحالي بالخزينة</div>
          <div className="text-2xl md:text-3xl font-black font-mono text-emerald-400 mt-0.5">
            {formatEGP(data?.treasury?.current_balance || 0)} <span className="text-xs text-slate-300 font-sans">ج.م</span>
          </div>
        </div>
      </div>

      {/* Financial Summary Cards */}
      {data?.summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <span className="text-xs font-bold text-slate-500 block mb-1">الرصيد الافتتاحي</span>
            <div className="text-lg md:text-xl font-black text-slate-800 font-mono">
              {formatEGP(data.summary.opening_balance)} <span className="text-xs text-slate-400">ج</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-sm bg-emerald-50/20">
            <span className="text-xs font-bold text-emerald-700 block mb-1">🟢 إجمالي الوارد (+)</span>
            <div className="text-lg md:text-xl font-black text-emerald-600 font-mono">
              +{formatEGP(data.summary.period_in)} <span className="text-xs text-slate-400">ج</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-rose-100 shadow-sm bg-rose-50/20">
            <span className="text-xs font-bold text-rose-700 block mb-1">🔴 إجمالي المنصرف (-)</span>
            <div className="text-lg md:text-xl font-black text-rose-600 font-mono">
              -{formatEGP(data.summary.period_out)} <span className="text-xs text-slate-400">ج</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-blue-100 shadow-sm bg-blue-50/20">
            <span className="text-xs font-bold text-blue-700 block mb-1">⚖️ صافي حركة الفترة</span>
            <div
              className={`text-lg md:text-xl font-black font-mono ${
                data.summary.period_net >= 0 ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {data.summary.period_net >= 0 ? "+" : ""}
              {formatEGP(data.summary.period_net)} <span className="text-xs text-slate-400">ج</span>
            </div>
          </div>
        </div>
      )}

      {/* Filters & Search Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search Box */}
          <div className="relative">
            <Lucide.Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث في البيان، الطرف، الملاحظات..."
              className="w-full pr-9 pl-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Type Filter */}
          <div>
            <select
              value={typeFilter}
              onChange={(e: any) => setTypeFilter(e.target.value)}
              className="w-full py-2 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">📊 كل الحركات (الوارد والمنصرف)</option>
              <option value="in">🟢 الوارد فقط (+)</option>
              <option value="out">🔴 المنصرف فقط (-)</option>
            </select>
          </div>

          {/* From Date */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-500 shrink-0">من:</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full py-2 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* To Date */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-500 shrink-0">إلى:</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full py-2 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Clear Filters helper */}
        {(search || fromDate || toDate || typeFilter !== "all") && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
            <span className="text-slate-500 font-medium">
              يتم عرض <strong>{data?.items?.length || 0}</strong> حركة مطابقة للفلاتر
            </span>
            <button
              onClick={() => {
                setSearch("");
                setFromDate("");
                setToDate("");
                setTypeFilter("all");
              }}
              className="text-blue-600 hover:text-blue-800 font-bold cursor-pointer"
            >
              إعادة ضبط الفلاتر ↺
            </button>
          </div>
        )}
      </div>

      {/* Transactions Ledger Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-slate-400 font-bold">
            <Lucide.Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-blue-600" />
            <span>جاري تحميل سجل حركات الخزينة...</span>
          </div>
        ) : error ? (
          <div className="p-12 text-center text-rose-600 font-bold">❌ {error}</div>
        ) : data?.items?.length === 0 ? (
          <div className="p-16 text-center text-slate-400 font-semibold space-y-2">
            <div className="text-3xl">📋</div>
            <p>لا توجد حركات مسجلة لهذه الخزينة وفق الفلاتر المحددة</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm text-right border-collapse">
              <thead>
                <tr className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200 text-[11px] sm:text-xs">
                  <th className="p-3">#</th>
                  <th className="p-3">التاريخ والوقت</th>
                  <th className="p-3">النوع والتصنيف</th>
                  <th className="p-3">البيان والملاحظات</th>
                  <th className="p-3 text-center text-emerald-700">وارد (+)</th>
                  <th className="p-3 text-center text-rose-700">منصرف (-)</th>
                  <th className="p-3 text-center text-slate-900 bg-slate-200/50">الرصيد بعد الحركة</th>
                  <th className="p-3 text-center">المستخدم</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.items?.map((item, idx) => {
                  const isIn = item.type === "in";
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 text-slate-400 font-mono text-xs">{idx + 1}</td>
                      <td className="p-3 whitespace-nowrap font-medium text-slate-700">
                        {item.date ? formatDate(item.date) : "—"}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                            isIn ? "bg-emerald-100/70 text-emerald-800" : "bg-rose-100/70 text-rose-800"
                          }`}
                        >
                          <span>{isIn ? "🟢" : "🔴"}</span>
                          <span>{item.category}</span>
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-slate-900">{item.label}</div>
                        {item.notes && item.notes !== item.label && (
                          <div className="text-[11px] text-slate-500 mt-0.5">{item.notes}</div>
                        )}
                      </td>
                      <td className="p-3 font-mono font-bold text-emerald-700 text-center whitespace-nowrap text-sm">
                        {item.amountIn > 0 ? `+${formatEGP(item.amountIn)}` : "—"}
                      </td>
                      <td className="p-3 font-mono font-bold text-rose-700 text-center whitespace-nowrap text-sm">
                        {item.amountOut > 0 ? `-${formatEGP(item.amountOut)}` : "—"}
                      </td>
                      <td className="p-3 font-mono font-black text-slate-900 text-center whitespace-nowrap bg-slate-50 text-sm">
                        {formatEGP(item.balance)} <span className="text-[10px] text-slate-400 font-sans">ج</span>
                      </td>
                      <td className="p-3 text-center text-xs text-slate-600 whitespace-nowrap">
                        {item.user || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Direct Deposit/Withdrawal Modal */}
      {showTxModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowTxModal(null)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <span>{showTxModal === "deposit" ? "🟢 إيداع نقدي مباشر" : "🔴 سحب نقدي مباشر"}</span>
              </h3>
              <button
                onClick={() => setShowTxModal(null)}
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
                  placeholder={showTxModal === "deposit" ? "مثال: تغذية خزينة من حساب البنك" : "مثال: سحب عهدة شراء"}
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
                    showTxModal === "deposit"
                      ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20"
                      : "bg-rose-600 hover:bg-rose-700 shadow-rose-600/20"
                  }`}
                >
                  {txSubmitting ? "جاري الحفظ..." : showTxModal === "deposit" ? "تأكيد الإيداع (+)" : "تأكيد السحب (-)"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowTxModal(null)}
                  className="py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
