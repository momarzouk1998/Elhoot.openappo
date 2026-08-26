"use client";
import { useState } from "react";
import { useApi } from "@/hooks/useApi";
import { formatEGP, formatDate } from "@/lib/format";
import ModalShell from "@/components/ModalShell";

interface PaymentReceiptModalProps {
  paymentId: string;
  onClose: () => void;
}

export default function PaymentReceiptModal({ paymentId, onClose }: PaymentReceiptModalProps) {
  const { data: payment, loading } = useApi<any>(`/api/payments/customers/${paymentId}`);
  const [sharingWhatsapp, setSharingWhatsapp] = useState(false);
  const [downloadingImage, setDownloadingImage] = useState(false);

  if (loading) {
    return (
      <ModalShell onClose={onClose} wide>
        <div className="p-8 text-center space-y-3">
          <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-bold text-gray-600">جاري فتح إيصال التحصيل...</p>
        </div>
      </ModalShell>
    );
  }

  if (!payment) {
    return (
      <ModalShell onClose={onClose} wide>
        <div className="p-8 text-center space-y-3">
          <p className="text-sm font-bold text-red-600">❌ لم يتم العثور على إيصال التحصيل</p>
          <button onClick={onClose} className="btn-secondary text-xs">إغلاق</button>
        </div>
      </ModalShell>
    );
  }

  const prevBal = Number(payment.prev_balance || 0);
  const paid = Number(payment.amount || 0);
  const newBal = Number(payment.new_balance || 0);
  const payDate = payment.payment_date || payment.created_at;

  const handleShareWhatsapp = async () => {
    if (sharingWhatsapp) return;
    const element = document.getElementById("receipt-sheet-" + paymentId);
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
      });

      const customerPhone = payment.customer?.whatsapp || payment.customer?.phone;
      const cleanPhone = customerPhone ? String(customerPhone).replace(/\D/g, "") : "";
      const formattedPhone = cleanPhone.startsWith("0") ? ("2" + cleanPhone) : cleanPhone;
      const customerName = payment.customer?.name || "العميل المحترم";
      const receiptText = `مرحباً بك أستاذ ${customerName}،\nمرفق إيصال تحصيل شركة الحوت للأدوات الكهربائية.\nالدفعة المسلمة: ${formatEGP(paid)} ج\nالمتبقي النهائي: ${formatEGP(newBal)} ج\nشكراً لتعاملكم معنا.`;

      if (typeof navigator !== "undefined" && typeof (navigator as any).canShare === "function") {
        try {
          const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
          if (blob) {
            const file = new File([blob as BlobPart], `إيصال_تحصيل_${customerName}.png`, { type: "image/png" });
            if ((navigator as any).canShare({ files: [file] })) {
              await navigator.share({
                files: [file],
                title: "إيصال تحصيل شركة الحوت",
                text: receiptText,
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
      link.download = `إيصال_تحصيل_${customerName}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();

      const waUrl = formattedPhone
        ? `https://wa.me/${formattedPhone}?text=${encodeURIComponent(receiptText)}`
        : `https://wa.me/?text=${encodeURIComponent(receiptText)}`;
      window.open(waUrl, "_blank");
    } catch (err) {
      console.error(err);
      alert("❌ حدث خطأ أثناء إرسال الإيصال عبر واتساب");
    } finally {
      setSharingWhatsapp(false);
    }
  };

  const handleDownloadImage = async () => {
    if (downloadingImage) return;
    const element = document.getElementById("receipt-sheet-" + paymentId);
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
      });
      const link = document.createElement("a");
      link.download = `إيصال_تحصيل_${payment.customer?.name || "عميل"}.png`;
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
    <ModalShell onClose={onClose} wide>
      {/* Floating Close Button */}
      <div className="relative">
        <button
          onClick={onClose}
          className="absolute top-3 left-3 z-20 w-8 h-8 rounded-full bg-slate-900/80 hover:bg-slate-950 text-white flex items-center justify-center transition-colors cursor-pointer shadow-lg"
          title="إغلاق"
        >
          ✕
        </button>
      </div>

      <div className="p-2 sm:p-4 max-h-[85vh] overflow-y-auto">
        <div
          id={"receipt-sheet-" + paymentId}
          className="bg-white rounded-2xl border border-slate-300 shadow-md p-4 sm:p-6 text-right space-y-4 max-w-2xl mx-auto"
          style={{ direction: "rtl", fontFamily: "'Segoe UI', Tahoma, Arial, sans-serif" }}
        >
          {/* Header */}
          <div className="border-b-2 border-slate-200 pb-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 bg-white rounded-xl p-1 border-2 border-emerald-500 shrink-0 shadow-sm flex items-center justify-center">
                  <img src="/logo.png" alt="شركة الحوت" className="w-full h-full object-contain" />
                </div>
                <div>
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900 leading-tight">
                    شركة الحوت
                  </h2>
                  <p className="text-xs font-bold text-amber-600">للأدوات واللوحات الكهربائية</p>
                  <p className="text-[11px] text-gray-500">تجارة وتوزيع الجملة ▪ سند استلام مبلغ</p>
                </div>
              </div>

              <div className="bg-emerald-700 text-white px-3 py-1.5 rounded-xl text-center shrink-0">
                <span className="text-xs font-bold block">💳 إيصال تحصيل نقدية</span>
                <span className="text-[11px] text-emerald-100 font-mono block mt-0.5">{formatDate(payDate)}</span>
              </div>
            </div>
          </div>

          {/* Customer Details */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2 text-sm">
            <div className="flex justify-between items-center flex-wrap gap-1">
              <span className="text-gray-500 text-xs">العميل المكرم:</span>
              <strong className="text-slate-900 font-extrabold text-base">{payment.customer?.name}</strong>
            </div>
            {payment.customer?.phone && (
              <div className="flex justify-between items-center text-xs text-gray-600">
                <span>الهاتف:</span>
                <span className="font-mono font-bold">{payment.customer.phone}</span>
              </div>
            )}
            <div className="flex justify-between items-center text-xs text-gray-600 pt-1 border-t border-slate-200">
              <span>طريقة الدفع:</span>
              <span className="font-bold text-slate-800">{payment.payment_method}</span>
            </div>
            {payment.treasury?.name && (
              <div className="flex justify-between items-center text-xs text-gray-600">
                <span>الخزينة:</span>
                <span className="font-bold text-slate-800">{payment.treasury.name}</span>
              </div>
            )}
            {payment.creator?.full_name && (
              <div className="flex justify-between items-center text-xs text-gray-500">
                <span>المحصل:</span>
                <span>{payment.creator.full_name}</span>
              </div>
            )}
          </div>

          {/* 3-Column Financial Breakdown Box */}
          <div className="border-2 border-emerald-600 rounded-2xl overflow-hidden shadow-sm">
            <div className="bg-emerald-800 text-white text-center py-2 px-3 text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5">
              <span>📊</span>
              <span>ملخص الحساب والتحصيل الحالي</span>
            </div>

            <div className="grid grid-cols-3 divide-x divide-x-reverse divide-slate-200 bg-white text-center p-3 sm:p-4">
              <div className="space-y-1">
                <span className="text-[11px] sm:text-xs font-bold text-gray-500 block">الحساب السابق</span>
                <span className={`text-sm sm:text-lg font-black font-mono block ${prevBal > 0 ? "text-rose-700" : prevBal < 0 ? "text-emerald-700" : "text-slate-700"}`}>
                  {formatEGP(prevBal)} ج
                </span>
              </div>

              <div className="space-y-1 bg-emerald-50/50 py-1 rounded-lg">
                <span className="text-[11px] sm:text-xs font-extrabold text-emerald-800 block">الدفعة / التحصيل</span>
                <span className="text-base sm:text-xl font-black font-mono text-emerald-600 block">
                  -{formatEGP(paid)} ج
                </span>
              </div>

              <div className="space-y-1">
                <span className="text-[11px] sm:text-xs font-bold text-gray-500 block">= المتبقي النهائي</span>
                <span className={`text-sm sm:text-lg font-black font-mono block ${newBal > 0 ? "text-rose-700" : newBal < 0 ? "text-emerald-700" : "text-slate-700"}`}>
                  {formatEGP(newBal)} ج
                </span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {payment.notes && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-xs text-amber-900">
              <strong>ملاحظات: </strong> {payment.notes}
            </div>
          )}

          {/* Footer branding */}
          <div className="text-center pt-2 text-[11px] text-gray-500 border-t border-slate-200">
            شركة الحوت للأدوات واللوحات الكهربائية ▪ تجارة وتوزيع الجملة
          </div>
        </div>
      </div>

      {/* Modal Footer Actions */}
      <div className="p-3 bg-slate-100 border-t border-slate-200 rounded-b-2xl flex items-center justify-end gap-2">
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
    </ModalShell>
  );
}
