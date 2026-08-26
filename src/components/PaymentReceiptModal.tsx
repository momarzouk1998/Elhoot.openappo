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

  // ─── WhatsApp: instant text — no screenshot, no delay ───────────────────────
  const handleShareWhatsapp = () => {
    const customerPhone = payment.customer?.whatsapp || payment.customer?.phone;
    const cleanPhone    = customerPhone ? String(customerPhone).replace(/\D/g, "") : "";
    const formattedPhone = cleanPhone.startsWith("0") ? `2${cleanPhone}` : cleanPhone;
    const customerName  = payment.customer?.name || "العميل المحترم";

    const msg = [
      `مرحباً بك أستاذ ${customerName} 👋`,
      ``,
      `📋 *إيصال تحصيل — شركة الحوت*`,
      `📅 ${formatDate(payDate)}`,
      ``,
      `💰 السابق:  ${formatEGP(prevBal)} ج`,
      `✅ المدفوع: ${formatEGP(paid)} ج`,
      `📌 المتبقي: ${formatEGP(newBal)} ج`,
      ``,
      `طريقة الدفع: ${payment.payment_method || "—"}`,
      payment.treasury?.name ? `الخزينة: ${payment.treasury.name}` : "",
      ``,
      `شكراً لتعاملكم مع شركة الحوت 🙏`,
    ].filter((l) => l !== null).join("\n");

    const waUrl = formattedPhone
      ? `https://wa.me/${formattedPhone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;

    window.open(waUrl, "_blank");
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
            <div className="flex items-center justify-between gap-3 pb-3 border-b-2 border-slate-100">
              {/* Logo + name */}
              <div className="flex items-center gap-2.5">
                <div className="w-12 h-12 bg-white rounded-xl p-1 border-2 border-emerald-500 shrink-0 shadow-sm flex items-center justify-center">
                  <img src="/logo.png" alt="شركة الحوت" className="w-full h-full object-contain" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900 leading-tight">شركة الحوت</h2>
                  <p className="text-xs font-bold text-amber-600">للأدوات واللوحات الكهربائية</p>
                </div>
              </div>

              {/* Badge: type + date in one line */}
              <div className="bg-emerald-700 text-white px-3 py-1.5 rounded-xl text-center shrink-0">
                <span className="text-xs font-bold flex items-center gap-1.5 whitespace-nowrap">
                  💳 إيصال تحصيل
                  <span className="text-emerald-200 font-mono text-[11px]">{formatDate(payDate)}</span>
                </span>
              </div>
            </div>

            {/* Customer details */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5 text-sm">
              {/* Customer name — prominent, no label */}
              <p className="text-base font-extrabold text-slate-900 text-right">
                {payment.customer?.name}
              </p>

              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-600 pt-1 border-t border-slate-100">
                {payment.customer?.phone && (
                  <span>📞 <span className="font-mono font-bold">{payment.customer.phone}</span></span>
                )}
                <span>💳 <span className="font-bold text-slate-800">{payment.payment_method}</span></span>
                {payment.treasury?.name && (
                  <span>🏦 <span className="font-bold text-slate-800">{payment.treasury.name}</span></span>
                )}
                {payment.creator?.full_name && (
                  <span className="text-gray-400">المحصل: {payment.creator.full_name}</span>
                )}
              </div>
            </div>

            {/* 3-Column Financial Summary */}
            <div className="border-2 border-emerald-600 rounded-xl overflow-hidden">
              <div className="bg-emerald-800 text-white text-center py-1.5 px-3 text-xs font-extrabold">
                📊 ملخص الحساب
              </div>

              <div className="grid grid-cols-3 bg-white text-center divide-x divide-x-reverse divide-slate-200">
                {/* السابق */}
                <div className="py-3 px-1 space-y-1">
                  <span className="text-[11px] font-bold text-gray-500 block">السابق</span>
                  <span className={`text-base font-black font-mono block ${prevBal > 0 ? "text-rose-700" : prevBal < 0 ? "text-emerald-700" : "text-slate-700"}`}>
                    {formatEGP(prevBal)} ج
                  </span>
                </div>

                {/* المدفوع */}
                <div className="py-3 px-1 space-y-1 bg-emerald-50">
                  <span className="text-[11px] font-extrabold text-emerald-800 block">المدفوع</span>
                  <span className="text-lg font-black font-mono text-emerald-600 block">
                    -{formatEGP(paid)} ج
                  </span>
                </div>

                {/* المتبقي */}
                <div className="py-3 px-1 space-y-1">
                  <span className="text-[11px] font-bold text-gray-500 block">المتبقي</span>
                  <span className={`text-base font-black font-mono block ${newBal > 0 ? "text-rose-700" : newBal < 0 ? "text-emerald-700" : "text-slate-700"}`}>
                    {formatEGP(newBal)} ج
                  </span>
                </div>
              </div>
            </div>

            {/* Notes */}
            {payment.notes && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-xs text-amber-900">
                <strong>ملاحظات: </strong>{payment.notes}
              </div>
            )}

            {/* Footer */}
            <p className="text-center text-[11px] text-gray-400 pt-1 border-t border-slate-100">
              شركة الحوت للأدوات واللوحات الكهربائية ▪ تجارة وتوزيع الجملة
            </p>
          </div>
        </div>

        {/* ── Actions ─────────────────────────────────────────────────────── */}
        <div className="px-3 pb-3 flex items-center gap-2">
          {/* WhatsApp — instant, no loading state needed */}
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
