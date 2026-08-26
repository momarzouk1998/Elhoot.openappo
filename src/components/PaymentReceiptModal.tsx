"use client";
import { useState } from "react";
import { useApi } from "@/hooks/useApi";
import { formatEGP, formatDate } from "@/lib/format";
import { captureElementToCanvas } from "@/lib/html2canvas-safe";

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
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl p-8 text-center space-y-3 shadow-2xl max-w-sm w-full">
          <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-bold text-gray-600">جاري فتح إيصال التحصيل...</p>
        </div>
      </div>
    );
  }

  if (!payment) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl p-8 text-center space-y-3 shadow-2xl max-w-sm w-full">
          <p className="text-sm font-bold text-red-600">❌ لم يتم العثور على إيصال التحصيل</p>
          <button onClick={onClose} className="btn-secondary text-xs">إغلاق</button>
        </div>
      </div>
    );
  }

  const prevBal = Number(payment.prev_balance || 0);
  const paid    = Number(payment.amount || 0);
  const newBal  = Number(payment.new_balance || 0);
  const payDate = payment.payment_date || payment.created_at;
  const customerName = payment.customer?.name || "العميل المحترم";

  // ─── Native WhatsApp Share: Mobile Native Share Sheet with Image ───────────
  const handleShareWhatsapp = async () => {
    if (sharingWhatsapp) return;
    const element = document.getElementById("receipt-sheet-" + paymentId);
    if (!element) return;

    try {
      setSharingWhatsapp(true);
      const canvas = await captureElementToCanvas(element, { scale: 2.5 });

      const customerPhone = payment.customer?.whatsapp || payment.customer?.phone;
      const cleanPhone = customerPhone ? String(customerPhone).replace(/\D/g, "") : "";
      const formattedPhone = cleanPhone.startsWith("0") ? `2${cleanPhone}` : cleanPhone;
      const receiptText = `مرحباً بك أستاذ ${customerName}،\nمرفق إيصال تحصيل شركة الحوت للأدوات الكهربائية.\nالدفعة المسلمة: ${formatEGP(paid)} ج\nالمتبقي النهائي: ${formatEGP(newBal)} ج\nشكراً لتعاملكم معنا.`;

      // 1. Native Mobile Web Share API
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
          if (shareErr?.name === "AbortError") return;
          console.warn("Native share failed, fallback to direct download", shareErr);
        }
      }

      // 2. Fallback: Auto download image and open WhatsApp
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
      alert("❌ حدث خطأ أثناء تجهيز الإيصال للمشاركة");
    } finally {
      setSharingWhatsapp(false);
    }
  };

  // ─── Download: screenshot for image ────────────────────────────────────────
  const handleDownloadImage = async () => {
    if (downloadingImage) return;
    const element = document.getElementById("receipt-sheet-" + paymentId);
    if (!element) return;
    try {
      setDownloadingImage(true);
      const canvas = await captureElementToCanvas(element, { scale: 2.5 });
      const link = document.createElement("a");
      link.download = `إيصال_تحصيل_${customerName}.png`;
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
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200"
      >
        {/* ── Receipt Sheet ───────────────────────────────────────────────── */}
        <div className="p-3 sm:p-5 overflow-y-auto max-h-[80vh]">
          <div
            id={"receipt-sheet-" + paymentId}
            className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 text-right"
            style={{ direction: "rtl", fontFamily: "'Segoe UI', Tahoma, Arial, sans-serif" }}
          >
            {/* Header */}
            <div className="pb-3 border-b-2 border-slate-100">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-11 h-11 rounded-lg border border-sky-600 p-0.5 bg-white flex items-center justify-center shrink-0">
                    <img src="/logo.png" alt="شركة الحوت" className="w-full h-full object-contain" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-sm leading-tight">شركة الحوت</h3>
                    <p className="text-[11px] text-sky-700 font-semibold">للأدوات واللوحات الكهربائية</p>
                  </div>
                </div>
                <div className="text-left shrink-0">
                  <span className="inline-block bg-emerald-600 text-white text-[11px] font-bold px-2.5 py-1 rounded-full">
                    إيصال تحصيل نقدية
                  </span>
                  <p className="text-[11px] text-slate-400 mt-1">{formatDate(payDate)}</p>
                </div>
              </div>
            </div>

            {/* Customer info */}
            <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100 flex items-center justify-between text-xs">
              <div>
                <span className="text-slate-400">العميل: </span>
                <strong className="text-slate-800 text-sm font-extrabold">{payment.customer?.name || "عميل عام"}</strong>
              </div>
              {payment.customer?.phone && (
                <span className="text-slate-500 font-mono text-[11px]">📞 {payment.customer.phone}</span>
              )}
            </div>

            {/* Amount paid box */}
            <div className="bg-emerald-50 border-2 border-emerald-500 rounded-xl p-3.5 text-center">
              <p className="text-xs text-emerald-800 font-bold mb-1">المبلغ المحصل</p>
              <p className="text-2xl font-black text-emerald-700 font-mono">
                {formatEGP(paid)} <span className="text-sm font-bold">ج.م</span>
              </p>
              {payment.payment_method && (
                <p className="text-[11px] text-emerald-600 mt-1 font-semibold">طريقة الدفع: {payment.payment_method}</p>
              )}
            </div>

            {/* Balances summary */}
            <div className="grid grid-cols-2 gap-2 text-center text-xs">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2">
                <p className="text-slate-400 text-[10px] mb-0.5">الحساب السابق</p>
                <p className="font-bold text-slate-700 font-mono text-sm">{formatEGP(prevBal)} ج</p>
              </div>
              <div className="bg-sky-50 border border-sky-200 rounded-lg p-2">
                <p className="text-sky-700 text-[10px] mb-0.5 font-bold">المتبقي النهائي</p>
                <p className="font-extrabold text-sky-900 font-mono text-sm">{formatEGP(newBal)} ج</p>
              </div>
            </div>

            {/* Treasury info */}
            {payment.treasury && (
              <div className="text-[11px] text-slate-400 flex items-center justify-between px-1">
                <span>الخزينة المودع بها:</span>
                <strong className="text-slate-600">{payment.treasury.name}</strong>
              </div>
            )}

            {payment.notes && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-800">
                <strong>ملاحظة: </strong>{payment.notes}
              </div>
            )}

            {/* Footer note */}
            <div className="pt-2 border-t border-slate-100 text-center text-[10px] text-slate-400">
              شكراً لتعاملكم معنا ▪ شركة الحوت للأدوات الكهربائية
            </div>
          </div>
        </div>

        {/* ── Actions ─────────────────────────────────────────────────────── */}
        <div className="px-3 pb-3 flex items-center gap-2">
          {/* WhatsApp — native share sheet */}
          <button
            type="button"
            onClick={handleShareWhatsapp}
            disabled={sharingWhatsapp}
            className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 active:scale-95 text-white text-sm font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <span>{sharingWhatsapp ? "⏳" : "📲"}</span>
            <span>{sharingWhatsapp ? "جاري التجهيز..." : "إرسال واتساب"}</span>
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
