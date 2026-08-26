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

  // ─── Direct WhatsApp Share Handler: Native Image Share (Open Contact Chooser) ──
  const handleShareWhatsapp = async () => {
    if (sharingWhatsapp) return;
    const element = document.getElementById("receipt-sheet-" + paymentId);
    if (!element) return;
    try {
      setSharingWhatsapp(true);

      const canvas = await captureElementToCanvas(element, { scale: 2 });
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));

      if (blob && typeof navigator !== "undefined" && typeof navigator.share === "function") {
        const file = new File([blob], `receipt_${paymentId.slice(0, 8)}.png`, { type: "image/png" });

        // Native Mobile Share with Image File (Lets user pick ANY WhatsApp chat directly)
        if (typeof (navigator as any).canShare === "function" && (navigator as any).canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: "إيصال تحصيل شركة الحوت",
          });
          return;
        }

        // Fallback Native Share
        await navigator.share({
          files: [file],
        });
        return;
      }

      // Desktop / Non-WebShare Fallback: Download image & Open WhatsApp Contact Chooser
      const link = document.createElement("a");
      link.download = `إيصال_تحصيل_${customerName}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();

      // Open WhatsApp without locking to any phone number
      const receiptText = `مرحباً أستاذ ${customerName}، مرفق إيصال تحصيل شركة الحوت بقيمة ${formatEGP(paid)} ج (المتبقي: ${formatEGP(newBal)} ج)`;
      window.location.href = `whatsapp://send?text=${encodeURIComponent(receiptText)}`;
    } catch (err: any) {
      if (err?.name === "AbortError") return; // User closed share sheet
      console.error(err);
      alert("❌ تعذر مشاركة الصورة مباشرة، تم تنزيلها على جهازك.");
    } finally {
      setSharingWhatsapp(false);
    }
  };

  // ─── Download image ─────────────────────────────────────────────────────────
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

  // ─── Print page ────────────────────────────────────────────────────────────
  const handlePrint = () => {
    window.open(`/print/payment/customer/${paymentId}`, "_blank");
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
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-12 h-12 bg-white rounded-xl p-1 border-2 border-emerald-500 shrink-0 shadow-sm flex items-center justify-center">
                    <img src="/logo.png" alt="شركة الحوت" className="w-full h-full object-contain" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-black text-slate-900 text-base leading-tight">شركة الحوت</h3>
                    <p className="text-xs text-slate-500 font-bold">للأدوات واللوحات الكهربائية</p>
                  </div>
                </div>
                <div className="text-left shrink-0">
                  <span className="inline-block bg-emerald-600 text-white text-xs font-black px-3 py-1 rounded-full shadow-sm">
                    إيصال تحصيل نقدية
                  </span>
                  <p className="text-[11px] text-slate-400 font-bold mt-1">{formatDate(payDate)}</p>
                </div>
              </div>
            </div>

            {/* Customer info */}
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 flex items-center justify-between text-xs">
              <div>
                <span className="text-slate-400 font-medium">العميل: </span>
                <strong className="text-slate-900 text-sm font-black">{payment.customer?.name || "عميل عام"}</strong>
              </div>
              {payment.customer?.phone && (
                <span className="text-slate-600 font-mono text-xs bg-white px-2 py-0.5 rounded border border-slate-200">
                  📞 {payment.customer.phone}
                </span>
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
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                <p className="text-slate-400 text-[11px] mb-0.5 font-semibold">الحساب السابق</p>
                <p className="font-extrabold text-slate-700 font-mono text-sm">{formatEGP(prevBal)} ج</p>
              </div>
              <div className="bg-sky-50 border-2 border-sky-500 rounded-xl p-2.5">
                <p className="text-sky-800 text-[11px] mb-0.5 font-black">المتبقي النهائي</p>
                <p className="font-black text-sky-900 font-mono text-sm">{formatEGP(newBal)} ج</p>
              </div>
            </div>

            {/* Treasury info */}
            {payment.treasury && (
              <div className="text-xs text-slate-400 flex items-center justify-between px-1">
                <span>الخزينة المودع بها:</span>
                <strong className="text-slate-700 font-bold">{payment.treasury.name}</strong>
              </div>
            )}

            {payment.notes && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-xs text-amber-800 font-medium">
                <strong>ملاحظة: </strong>{payment.notes}
              </div>
            )}

            {/* Footer note */}
            <div className="pt-2 border-t border-slate-100 text-center text-[11px] text-slate-400 font-semibold">
              شكراً لتعاملكم معنا ▪ شركة الحوت للأدوات الكهربائية
            </div>
          </div>
        </div>

        {/* ── Actions ─────────────────────────────────────────────────────── */}
        <div className="px-3 pb-3 flex items-center gap-2">
          {/* WhatsApp — native image share */}
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
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 active:scale-95 text-white text-sm font-bold px-3 py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
            title="تحميل صورة"
          >
            {downloadingImage ? "⏳" : "🖼️"}
          </button>

          {/* Print */}
          <button
            type="button"
            onClick={handlePrint}
            className="bg-slate-800 hover:bg-slate-900 active:scale-95 text-white text-sm font-bold px-3 py-2.5 rounded-xl flex items-center justify-center shadow-sm transition-all cursor-pointer"
            title="طباعة"
          >
            🖨️
          </button>

          <button
            type="button"
            onClick={onClose}
            className="bg-white hover:bg-slate-100 text-slate-600 border border-slate-300 text-sm font-bold px-3 py-2.5 rounded-xl transition-all active:scale-95 cursor-pointer"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
