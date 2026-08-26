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
  const [sharingWhatsapp, setSharingWhatsapp] = useState(false);
  const [downloadingImage, setDownloadingImage] = useState(false);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl p-8 text-center space-y-3 shadow-2xl max-w-sm w-full">
          <div className="w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
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
  const customerName = customer.name || "العميل المحترم";

  // ─── Native WhatsApp Share: Mobile Native Share Sheet with Image ───────────
  const handleShareWhatsapp = async () => {
    if (sharingWhatsapp) return;
    const element = document.getElementById(sheetId);
    if (!element) return;

    try {
      setSharingWhatsapp(true);
      const canvas = await captureElementToCanvas(element, { scale: 2.5 });

      const customerPhone = customer.whatsapp || customer.phone;
      const cleanPhone    = customerPhone ? String(customerPhone).replace(/\D/g, "") : "";
      const formattedPhone = cleanPhone.startsWith("0") ? `2${cleanPhone}` : cleanPhone;
      const receiptText = `مرحباً بك أستاذ ${customerName}،\nمرفق كشف حساب شركة الحوت للأدوات الكهربائية.\nالمتبقي النهائي: ${formatEGP(finalBalance)} ج\nشكراً لتعاملكم معنا.`;

      // 1. Native Mobile Web Share API
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        try {
          const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
          if (blob) {
            const file = new File([blob as BlobPart], `كشف_حساب_${customerName}.png`, { type: "image/png" });
            if (typeof (navigator as any).canShare === "function" && (navigator as any).canShare({ files: [file] })) {
              await navigator.share({
                files: [file],
                title: "كشف حساب شركة الحوت",
                text: receiptText,
              });
              return;
            }
          }

          // Fallback to native text share sheet
          await navigator.share({
            title: "كشف حساب شركة الحوت",
            text: receiptText,
          });
          return;
        } catch (shareErr: any) {
          if (shareErr?.name === "AbortError") return;
          console.warn("Native share error, falling back to direct app link:", shareErr);
        }
      }

      // 2. Fallback: Auto download image and open WhatsApp app directly
      const link = document.createElement("a");
      link.download = `كشف_حساب_${customerName}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();

      const directAppUrl = formattedPhone
        ? `whatsapp://send?phone=${formattedPhone}&text=${encodeURIComponent(receiptText)}`
        : `whatsapp://send?text=${encodeURIComponent(receiptText)}`;
      window.location.href = directAppUrl;
    } catch (err) {
      console.error(err);
      alert("❌ حدث خطأ أثناء تجهيز كشف الحساب للمشاركة");
    } finally {
      setSharingWhatsapp(false);
    }
  };

  // ─── Download Image ─────────────────────────────────────────────────────────
  const handleDownloadImage = async () => {
    if (downloadingImage) return;
    const element = document.getElementById(sheetId);
    if (!element) return;
    try {
      setDownloadingImage(true);
      const canvas = await captureElementToCanvas(element, { scale: 2.5 });
      const link = document.createElement("a");
      link.download = `كشف_حساب_${customerName}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.error(err);
      alert("❌ حدث خطأ أثناء تحميل الصورة");
    } finally {
      setDownloadingImage(false);
    }
  };

  // ─── Print page: opens styled server-rendered page ─────────────────────────
  const handlePrint = () => {
    window.open(`/print/statement/customer/${customerId}`, "_blank");
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
            <div className="pb-4 border-b-2 border-slate-100 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-xl border-2 border-sky-600 p-1 bg-white flex items-center justify-center shrink-0 shadow-sm">
                  <img src="/logo.png" alt="شركة الحوت" className="w-full h-full object-contain" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-lg leading-tight">شركة الحوت</h3>
                  <p className="text-xs text-sky-700 font-bold">للأدوات واللوحات الكهربائية ▪ تجارة وتوزيع الجملة</p>
                </div>
              </div>
              <div className="text-left shrink-0">
                <span className="inline-block bg-sky-900 text-white text-xs font-extrabold px-3.5 py-1.5 rounded-full shadow-sm">
                  كشف حساب عميل
                </span>
                <p className="text-xs text-slate-400 font-semibold mt-1.5">
                  التاريخ: {formatDate(new Date())}
                </p>
              </div>
            </div>

            {/* Customer Info Card */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex items-center justify-between text-sm">
              <div>
                <span className="text-slate-500 font-semibold text-xs">اسم العميل: </span>
                <strong className="text-slate-900 text-base font-black mr-1">{customer.name}</strong>
              </div>
              <div className="flex items-center gap-3">
                {customer.phone && (
                  <span className="text-slate-600 font-mono text-xs bg-white px-2.5 py-1 rounded-md border border-slate-200">
                    📞 {customer.phone}
                  </span>
                )}
              </div>
            </div>

            {/* Financial Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center text-xs">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                <p className="text-slate-500 font-semibold text-[11px] mb-0.5">رصيد افتتاحي</p>
                <p className="font-extrabold text-slate-800 font-mono text-sm">{formatEGP(customer.opening_balance || 0)} ج</p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-xl p-2.5">
                <p className="text-red-700 font-bold text-[11px] mb-0.5">إجمالي المبيعات (مدين)</p>
                <p className="font-extrabold text-red-700 font-mono text-sm">{formatEGP(totalDebit)} ج</p>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5">
                <p className="text-emerald-700 font-bold text-[11px] mb-0.5">إجمالي التحصيلات (دائن)</p>
                <p className="font-extrabold text-emerald-700 font-mono text-sm">{formatEGP(totalCredit)} ج</p>
              </div>
              <div className="bg-sky-50 border-2 border-sky-600 rounded-xl p-2.5">
                <p className="text-sky-900 font-black text-[11px] mb-0.5">الرصيد المتبقي النهائي</p>
                <p className={`font-black font-mono text-base ${Number(finalBalance) > 0 ? "text-red-700" : Number(finalBalance) < 0 ? "text-emerald-700" : "text-sky-900"}`}>
                  {formatEGP(finalBalance)} ج
                </p>
              </div>
            </div>

            {/* Transactions Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-right border-collapse" style={{ tableLayout: "auto" }}>
                  <thead>
                    <tr className="bg-slate-900 text-white font-bold text-[11px]">
                      <th className="p-2.5 text-center w-8">#</th>
                      <th className="p-2.5">التاريخ</th>
                      <th className="p-2.5">البيان / الحركة</th>
                      <th className="p-2.5 text-center">المرجع</th>
                      <th className="p-2.5 text-left text-red-300">مدين (+)</th>
                      <th className="p-2.5 text-left text-emerald-300">دائن (-)</th>
                      <th className="p-2.5 text-left text-sky-200 font-extrabold">الرصيد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries && entries.length > 0 ? (
                      entries.map((e: any, idx: number) => (
                        <tr
                          key={idx}
                          className={`border-t border-slate-100 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/70"}`}
                        >
                          <td className="p-2.5 text-center text-slate-400 font-mono font-bold">{idx + 1}</td>
                          <td className="p-2.5 font-mono text-slate-600 whitespace-nowrap">{formatDate(e.date)}</td>
                          <td className="p-2.5 font-bold text-slate-800">
                            <span>{e.label}</span>
                            {e.items && e.items.length > 0 && (
                              <span className="text-[10px] text-slate-500 font-normal mr-1.5 block sm:inline">
                                ({e.items.length} أصناف)
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 text-center font-mono font-semibold text-sky-700 whitespace-nowrap">{e.ref}</td>
                          <td className="p-2.5 text-left font-mono font-bold text-red-600">
                            {e.debit > 0 ? `${formatEGP(e.debit)} ج` : "—"}
                          </td>
                          <td className="p-2.5 text-left font-mono font-bold text-emerald-600">
                            {e.credit > 0 ? `${formatEGP(e.credit)} ج` : "—"}
                          </td>
                          <td className="p-2.5 text-left font-mono font-black text-slate-900 bg-slate-100/60">
                            {formatEGP(e.balance)} ج
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-slate-400 font-semibold">
                          لا توجد حركات مسجلة لهذا العميل
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer note */}
            <div className="pt-3 border-t border-slate-100 text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-1">
              <span className="font-bold text-slate-700">شركة الحوت للأدوات واللوحات الكهربائية</span>
              <span className="text-[11px] text-slate-400">شكراً لتعاملكم معنا ▪ للإدارة والاستفسارات يرجى التواصل عبر الواتساب أو الهاتف</span>
            </div>
          </div>
        </div>

        {/* ── Actions Footer ───────────────────────────────────────────────── */}
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {/* WhatsApp Native Share */}
            <button
              type="button"
              onClick={handleShareWhatsapp}
              disabled={sharingWhatsapp}
              className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 active:scale-95 text-white text-xs sm:text-sm font-bold px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <span>{sharingWhatsapp ? "⏳" : "📲"}</span>
              <span>{sharingWhatsapp ? "جاري التجهيز..." : "إرسال واتساب"}</span>
            </button>

            {/* Download Image */}
            <button
              type="button"
              onClick={handleDownloadImage}
              disabled={downloadingImage}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 active:scale-95 text-white text-xs sm:text-sm font-bold px-3.5 py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
              title="تحميل صورة كشف الحساب"
            >
              <span>{downloadingImage ? "⏳" : "🖼️"}</span>
              <span>{downloadingImage ? "جاري..." : "صورة"}</span>
            </button>

            {/* Print Page */}
            <button
              type="button"
              onClick={handlePrint}
              className="bg-slate-800 hover:bg-slate-900 active:scale-95 text-white text-xs sm:text-sm font-bold px-3.5 py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
              title="طباعة"
            >
              <span>🖨️</span>
              <span>طباعة</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs sm:text-sm font-bold px-4 py-2.5 rounded-xl transition-all active:scale-95 cursor-pointer"
          >
            ✕ إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
