"use client";
import { useState } from "react";
import { useApi } from "@/hooks/useApi";
import { formatEGP, formatDate } from "@/lib/format";
import { captureElementToCanvas } from "@/lib/html2canvas-safe";

interface CustomerStatementModalProps {
  customerId: string;
  onClose: () => void;
}

export default function CustomerStatementModal({ customerId, onClose }: CustomerStatementModalProps) {
  const { data: statementData, loading } = useApi<any>(`/api/customers/${customerId}/statement`);
  const [downloadingImage, setDownloadingImage] = useState(false);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl p-8 text-center space-y-3 shadow-2xl max-w-sm w-full">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-bold text-gray-600">جاري فتح كشف الحساب...</p>
        </div>
      </div>
    );
  }

  if (!statementData || !statementData.customer) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl p-8 text-center space-y-3 shadow-2xl max-w-sm w-full">
          <p className="text-sm font-bold text-red-600">❌ لم يتم العثور على بيانات كشف الحساب</p>
          <button onClick={onClose} className="btn-secondary text-xs">إغلاق</button>
        </div>
      </div>
    );
  }

  const { customer, entries, totalDebit, totalCredit, finalBalance } = statementData;
  const sheetId = "statement-sheet-" + customerId;

  // ─── WhatsApp: instant text — no screenshot, no delay ───────────────────────
  const handleShareWhatsapp = () => {
    const customerPhone = customer.whatsapp || customer.phone;
    const cleanPhone    = customerPhone ? String(customerPhone).replace(/\D/g, "") : "";
    const formattedPhone = cleanPhone.startsWith("0") ? `2${cleanPhone}` : cleanPhone;
    const customerName  = customer.name || "العميل المحترم";

    const msg = [
      `مرحباً بك أستاذ ${customerName} 👋`,
      ``,
      `📑 *كشف حساب — شركة الحوت*`,
      `📅 ${formatDate(new Date())}`,
      ``,
      `💸 المبيعات:  ${formatEGP(totalDebit)} ج`,
      `✅ السداد:    ${formatEGP(totalCredit)} ج`,
      `📌 المتبقي:   ${formatEGP(finalBalance)} ج`,
      ``,
      `شكراً لتعاملكم مع شركة الحوت 🙏`,
    ].join("\n");

    const waUrl = formattedPhone
      ? `https://wa.me/${formattedPhone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;

    window.open(waUrl, "_blank");
  };

  // ─── Download image ─────────────────────────────────────────────────────────
  const handleDownloadImage = async () => {
    if (downloadingImage) return;
    const element = document.getElementById(sheetId);
    if (!element) return;
    try {
      setDownloadingImage(true);
      const canvas = await captureElementToCanvas(element, { scale: 2 });
      const link = document.createElement("a");
      link.download = `كشف_حساب_${customer.name}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.error(err);
      alert("❌ حدث خطأ أثناء تحميل الصورة");
    } finally {
      setDownloadingImage(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]"
      >
        {/* ── Statement Sheet ─────────────────────────────────────────────── */}
        <div className="p-3 sm:p-5 overflow-y-auto flex-1">
          <div
            id={sheetId}
            className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 text-right space-y-4"
            style={{ direction: "rtl", fontFamily: "'Segoe UI', Tahoma, Arial, sans-serif", color: "#0f172a", backgroundColor: "#ffffff" }}
          >
            {/* Header */}
            <div style={{ borderBottom: "2px solid #e2e8f0", paddingBottom: "12px" }}>
              <div className="flex items-center justify-between flex-wrap gap-3">
                {/* Logo + name */}
                <div className="flex items-center gap-3">
                  <div style={{ width: "52px", height: "52px", backgroundColor: "#ffffff", borderRadius: "12px", padding: "3px", border: "2px solid #0284c7", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <img src="/logo.png" alt="شركة الحوت" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  </div>
                  <div>
                    <h2 style={{ fontSize: "1.2rem", fontWeight: 900, color: "#002b61", margin: 0, lineHeight: 1.2 }}>
                      شركة الحوت
                    </h2>
                    <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "#0284c7", margin: "2px 0 0 0" }}>
                      للأدوات واللوحات الكهربائية
                    </p>
                  </div>
                </div>

                {/* Badge: type + date in one line */}
                <div style={{ backgroundColor: "#0284c7", color: "#ffffff", padding: "6px 14px", borderRadius: "12px", textAlign: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: "0.78rem", fontWeight: 900, display: "flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap" }}>
                    📑 كشف حساب
                    <span style={{ color: "#bae6fd", fontFamily: "monospace", fontSize: "0.72rem" }}>{formatDate(new Date())}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Customer Details */}
            <div style={{ backgroundColor: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "12px", padding: "12px" }}>
              {/* Name — prominent, no label */}
              <p style={{ fontSize: "1rem", fontWeight: 900, color: "#0f172a", margin: "0 0 6px 0" }}>
                {customer.name}
              </p>
              {customer.phone && (
                <div className="text-xs" style={{ color: "#64748b", borderTop: "1px solid #e2e8f0", paddingTop: "6px" }}>
                  📞 <strong style={{ color: "#0f172a" }}>{customer.phone}</strong>
                </div>
              )}
            </div>

            {/* Transactions Table */}
            <div style={{ borderRadius: "12px", border: "1px solid #cbd5e1", overflow: "hidden" }}>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-right border-collapse">
                  <thead>
                    <tr style={{ backgroundColor: "#002b61", color: "#ffffff" }}>
                      <th className="p-2.5">التاريخ</th>
                      <th className="p-2.5">نوع الحركة</th>
                      <th className="p-2.5">البيان</th>
                      <th className="p-2.5 text-left">مدين</th>
                      <th className="p-2.5 text-left">دائن</th>
                      <th className="p-2.5 text-left">الرصيد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry: any, index: number) => (
                      <tr
                        key={entry.id + "-" + index}
                        style={{
                          borderBottom: "1px solid #e2e8f0",
                          backgroundColor: index % 2 === 0 ? "#ffffff" : "#f8fafc",
                        }}
                      >
                        <td className="p-2.5 font-mono text-[11px]" style={{ whiteSpace: "nowrap" }}>
                          {entry.type === "opening" ? "سابق" : formatDate(entry.date)}
                        </td>
                        <td
                          className="p-2.5 font-bold"
                          style={{ color: entry.type === "invoice" ? "#0284c7" : entry.type === "payment" ? "#16a34a" : "#dc2626" }}
                        >
                          {entry.label}
                        </td>
                        <td className="p-2.5 text-gray-700">
                          <span className="font-semibold">{entry.ref}</span>
                          {entry.items && entry.items.length > 0 && (
                            <div className="text-[10px] text-gray-500 mt-0.5">
                              {entry.items.map((i: any) => `${i.product_name} (${i.quantity})`).join(" ▪ ")}
                            </div>
                          )}
                        </td>
                        <td className="p-2.5 text-left font-mono font-bold" style={{ color: entry.debit > 0 ? "#0f172a" : "#94a3b8" }}>
                          {entry.debit > 0 ? formatEGP(entry.debit) : "—"}
                        </td>
                        <td className="p-2.5 text-left font-mono font-bold" style={{ color: entry.credit > 0 ? "#16a34a" : "#94a3b8" }}>
                          {entry.credit > 0 ? formatEGP(entry.credit) : "—"}
                        </td>
                        <td
                          className="p-2.5 text-left font-mono font-black"
                          style={{ color: entry.balance > 0 ? "#dc2626" : entry.balance < 0 ? "#16a34a" : "#0f172a" }}
                        >
                          {formatEGP(entry.balance)} ج
                        </td>
                      </tr>
                    ))}
                    {entries.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-gray-400">لا توجد حركات مسجلة للعميل</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Summary — 3 columns, short labels */}
            <div style={{ backgroundColor: "#f1f5f9", border: "2px solid #0284c7", borderRadius: "12px", overflow: "hidden" }}>
              <div style={{ backgroundColor: "#0284c7", color: "#ffffff", textAlign: "center", padding: "6px 12px", fontSize: "0.75rem", fontWeight: 900 }}>
                ملخص الحساب
              </div>
              <div className="grid grid-cols-3 text-center divide-x divide-x-reverse divide-slate-300" style={{ padding: "12px 8px" }}>
                <div>
                  <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 700, display: "block" }}>المبيعات</span>
                  <span style={{ fontSize: "0.95rem", fontWeight: 900, color: "#0f172a", fontFamily: "monospace", display: "block", marginTop: "2px" }}>
                    {formatEGP(totalDebit)} ج
                  </span>
                </div>
                <div>
                  <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 700, display: "block" }}>السداد</span>
                  <span style={{ fontSize: "0.95rem", fontWeight: 900, color: "#16a34a", fontFamily: "monospace", display: "block", marginTop: "2px" }}>
                    {formatEGP(totalCredit)} ج
                  </span>
                </div>
                <div>
                  <span style={{ fontSize: "11px", color: "#0284c7", fontWeight: 900, display: "block" }}>المتبقي</span>
                  <span
                    style={{
                      fontSize: "1.1rem",
                      fontWeight: 900,
                      color: finalBalance > 0 ? "#dc2626" : finalBalance < 0 ? "#16a34a" : "#0f172a",
                      fontFamily: "monospace",
                      display: "block",
                      marginTop: "2px",
                    }}
                  >
                    {formatEGP(finalBalance)} ج
                  </span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <p style={{ textAlign: "center", paddingTop: "8px", fontSize: "11px", color: "#94a3b8", borderTop: "1px solid #e2e8f0" }}>
              شركة الحوت للأدوات واللوحات الكهربائية ▪ تجارة وتوزيع الجملة
            </p>
          </div>
        </div>

        {/* ── Actions ─────────────────────────────────────────────────────── */}
        <div className="px-3 pb-3 flex items-center gap-2 shrink-0 border-t border-slate-200 pt-3 bg-slate-50">
          {/* WhatsApp — instant */}
          <button
            type="button"
            onClick={handleShareWhatsapp}
            className="flex-1 bg-green-600 hover:bg-green-700 active:scale-95 text-white text-sm font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            📲 إرسال واتساب
          </button>

          {/* Download image */}
          <button
            type="button"
            onClick={handleDownloadImage}
            disabled={downloadingImage}
            className="bg-slate-600 hover:bg-slate-700 disabled:bg-slate-400 active:scale-95 text-white text-sm font-bold px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
            title="تحميل صورة"
          >
            {downloadingImage ? "⏳" : "🖼️"}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="bg-white hover:bg-slate-100 text-slate-600 border border-slate-300 text-sm font-bold px-4 py-2.5 rounded-xl transition-all active:scale-95 cursor-pointer"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
