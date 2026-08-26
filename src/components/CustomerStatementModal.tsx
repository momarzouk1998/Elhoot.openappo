"use client";
import { useState } from "react";
import { useApi } from "@/hooks/useApi";
import { formatEGP, formatDate } from "@/lib/format";

interface CustomerStatementModalProps {
  customerId: string;
  onClose: () => void;
}

export default function CustomerStatementModal({ customerId, onClose }: CustomerStatementModalProps) {
  const { data: statementData, loading } = useApi<any>(`/api/customers/${customerId}/statement`);
  const [sharingWhatsapp, setSharingWhatsapp] = useState(false);
  const [downloadingImage, setDownloadingImage] = useState(false);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl p-8 text-center space-y-3 shadow-2xl max-w-sm w-full">
          <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
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

  const handleShareWhatsapp = async () => {
    if (sharingWhatsapp) return;
    const element = document.getElementById(sheetId);
    if (!element) return;
    try {
      setSharingWhatsapp(true);
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(element, {
        useCORS: true,
        allowTaint: true,
        scale: 2,
        backgroundColor: "#ffffff",
        scrollX: 0,
        scrollY: 0,
        onclone: (clonedDoc) => {
          const elements = clonedDoc.querySelectorAll('*');
          elements.forEach((el: any) => {
            if (el.style) {
              const computed = window.getComputedStyle(el);
              if (computed.backgroundColor && computed.backgroundColor.includes('oklch')) {
                el.style.backgroundColor = '#ffffff';
              }
              if (computed.color && computed.color.includes('oklch')) {
                el.style.color = '#0f172a';
              }
            }
          });
        },
      });

      const customerPhone = customer.whatsapp || customer.phone;
      const cleanPhone = customerPhone ? String(customerPhone).replace(/\D/g, "") : "";
      const formattedPhone = cleanPhone.startsWith("0") ? ("2" + cleanPhone) : cleanPhone;
      const customerName = customer.name || "العميل المحترم";
      const statementText = `مرحباً بك أستاذ ${customerName}،\nمرفق كشف حسابكم لدى شركة الحوت للأدوات واللوحات الكهربائية.\nالرصيد الحالي المستحق: ${formatEGP(finalBalance)} ج\nشكراً لتعاملكم معنا.`;

      if (typeof navigator !== "undefined" && typeof (navigator as any).canShare === "function") {
        try {
          const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
          if (blob) {
            const file = new File([blob as BlobPart], `كشف_حساب_${customerName}.png`, { type: "image/png" });
            if ((navigator as any).canShare({ files: [file] })) {
              await navigator.share({
                files: [file],
                title: "كشف حساب - شركة الحوت",
                text: statementText,
              });
              return;
            }
          }
        } catch (shareErr: any) {
          if (shareErr?.name !== "AbortError") {
            console.warn("Native share failed, falling back to download", shareErr);
          } else {
            return;
          }
        }
      }

      const link = document.createElement("a");
      link.download = `كشف_حساب_${customerName}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();

      const waUrl = formattedPhone
        ? `https://wa.me/${formattedPhone}?text=${encodeURIComponent(statementText)}`
        : `https://wa.me/?text=${encodeURIComponent(statementText)}`;
      window.open(waUrl, "_blank");
    } catch (err) {
      console.error(err);
      alert("❌ حدث خطأ أثناء مشاركة كشف الحساب عبر واتساب");
    } finally {
      setSharingWhatsapp(false);
    }
  };

  const handleDownloadImage = async () => {
    if (downloadingImage) return;
    const element = document.getElementById(sheetId);
    if (!element) return;
    try {
      setDownloadingImage(true);
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(element, {
        useCORS: true,
        allowTaint: true,
        scale: 2,
        backgroundColor: "#ffffff",
        scrollX: 0,
        scrollY: 0,
        onclone: (clonedDoc) => {
          const elements = clonedDoc.querySelectorAll('*');
          elements.forEach((el: any) => {
            if (el.style) {
              const computed = window.getComputedStyle(el);
              if (computed.backgroundColor && computed.backgroundColor.includes('oklch')) {
                el.style.backgroundColor = '#ffffff';
              }
              if (computed.color && computed.color.includes('oklch')) {
                el.style.color = '#0f172a';
              }
            }
          });
        },
      });
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
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-slate-200 relative flex flex-col max-h-[90vh]"
      >
        {/* Scrollable Content Container */}
        <div className="p-2 sm:p-5 overflow-y-auto flex-1">
          <div
            id={sheetId}
            className="bg-white rounded-2xl border border-slate-300 shadow-sm p-4 sm:p-6 text-right space-y-4 max-w-3xl mx-auto"
            style={{ direction: "rtl", fontFamily: "'Segoe UI', Tahoma, Arial, sans-serif", color: "#0f172a", backgroundColor: "#ffffff" }}
          >
            {/* Header */}
            <div style={{ borderBottom: "2px solid #e2e8f0", paddingBottom: "12px" }}>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div style={{ width: "56px", height: "56px", backgroundColor: "#ffffff", borderRadius: "12px", padding: "3px", border: "2px solid #0284c7", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <img src="/logo.png" alt="شركة الحوت" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  </div>
                  <div>
                    <h2 style={{ fontSize: "1.25rem", fontWeight: 900, color: "#002b61", margin: 0, lineHeight: 1.2 }}>
                      شركة الحوت
                    </h2>
                    <p style={{ fontSize: "0.8rem", fontWeight: 700, color: "#0284c7", margin: "2px 0 0 0" }}>
                      للأدوات واللوحات الكهربائية
                    </p>
                    <p style={{ fontSize: "0.7rem", color: "#64748b", margin: "2px 0 0 0" }}>
                      كشف حساب تفصيلي للحركات المالية
                    </p>
                  </div>
                </div>

                <div style={{ backgroundColor: "#0284c7", color: "#ffffff", padding: "6px 14px", borderRadius: "12px", textAlign: "center" }}>
                  <span style={{ fontSize: "0.8rem", fontWeight: 900, display: "block" }}>📑 كشف حساب عميل</span>
                  <span style={{ fontSize: "0.7rem", color: "#e0f2fe", display: "block", marginTop: "2px" }}>تاريخ الصدور: {formatDate(new Date())}</span>
                </div>
              </div>
            </div>

            {/* Customer Details Box */}
            <div style={{ backgroundColor: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "12px", padding: "12px" }} className="space-y-1.5 text-xs sm:text-sm">
              <div className="flex justify-between items-center flex-wrap gap-1">
                <span style={{ color: "#64748b" }}>العميل المكرم:</span>
                <strong style={{ color: "#0f172a", fontWeight: 900, fontSize: "1rem" }}>{customer.name}</strong>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1" style={{ borderTop: "1px solid #e2e8f0" }}>
                <div><span style={{ color: "#64748b" }}>الهاتف: </span><strong style={{ color: "#0f172a" }}>{customer.phone || "—"}</strong></div>
                <div><span style={{ color: "#64748b" }}>الواتساب: </span><strong style={{ color: "#0f172a" }}>{customer.whatsapp || "—"}</strong></div>
                {customer.address && <div className="sm:col-span-2"><span style={{ color: "#64748b" }}>العنوان: </span><strong style={{ color: "#0f172a" }}>{customer.address}</strong></div>}
              </div>
            </div>

            {/* Transactions Table */}
            <div style={{ borderRadius: "12px", border: "1px solid #cbd5e1", overflow: "hidden" }}>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-right border-collapse">
                  <thead>
                    <tr style={{ backgroundColor: "#002b61", color: "#ffffff" }}>
                      <th className="p-2.5">التاريخ</th>
                      <th className="p-2.5">نوع الحركة</th>
                      <th className="p-2.5">البيان / الرقم</th>
                      <th className="p-2.5 text-left">مدين (عليكم)</th>
                      <th className="p-2.5 text-left">دائن (لكم)</th>
                      <th className="p-2.5 text-left">الرصيد M</th>
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
                        <td className="p-2.5 font-bold" style={{ color: entry.type === "invoice" ? "#0284c7" : entry.type === "payment" ? "#16a34a" : "#dc2626" }}>
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

            {/* Summary Box */}
            <div style={{ backgroundColor: "#f1f5f9", border: "2px solid #0284c7", borderRadius: "12px", padding: "12px" }}>
              <div className="grid grid-cols-3 text-center divide-x divide-x-reverse divide-slate-300">
                <div>
                  <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 700, display: "block" }}>إجمالي المبيعات (عليكم)</span>
                  <span style={{ fontSize: "0.95rem", fontWeight: 900, color: "#0f172a", fontFamily: "monospace", display: "block", marginTop: "2px" }}>
                    {formatEGP(totalDebit)} ج
                  </span>
                </div>
                <div>
                  <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 700, display: "block" }}>إجمالي السداد (لكم)</span>
                  <span style={{ fontSize: "0.95rem", fontWeight: 900, color: "#16a34a", fontFamily: "monospace", display: "block", marginTop: "2px" }}>
                    {formatEGP(totalCredit)} ج
                  </span>
                </div>
                <div>
                  <span style={{ fontSize: "11px", color: "#0284c7", fontWeight: 900, display: "block" }}>الرصيد المتبقي النهائي</span>
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

            <div style={{ textAlign: "center", paddingTop: "8px", fontSize: "11px", color: "#64748b", borderTop: "1px solid #e2e8f0" }}>
              شركة الحوت للأدوات واللوحات الكهربائية ▪ تجارة وتوزيع الجملة
            </div>
          </div>
        </div>

        {/* Modal Footer Actions (ONLY ✕ إغلاق button, no floating X) */}
        <div className="p-3 bg-slate-100 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
          <button
            onClick={handleShareWhatsapp}
            disabled={sharingWhatsapp}
            className="flex-1 sm:flex-initial bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-xs sm:text-sm font-bold px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer"
            title="إرسال عبر واتساب"
          >
            <span>{sharingWhatsapp ? "⏳" : "📲"}</span>
            <span>{sharingWhatsapp ? "جاري الإرسال..." : "إرسال واتساب"}</span>
          </button>

          <button
            onClick={handleDownloadImage}
            disabled={downloadingImage}
            className="hidden sm:flex flex-1 sm:flex-initial bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-xs sm:text-sm font-bold px-4 py-2.5 rounded-xl items-center justify-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer"
            title="تحميل صورة"
          >
            <span>{downloadingImage ? "⏳" : "🖼️"}</span>
            <span>{downloadingImage ? "جاري..." : "صورة"}</span>
          </button>

          <button
            onClick={onClose}
            className="bg-white hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs sm:text-sm font-bold px-4 py-2.5 rounded-xl transition-all active:scale-95 cursor-pointer"
          >
            ✕ إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
