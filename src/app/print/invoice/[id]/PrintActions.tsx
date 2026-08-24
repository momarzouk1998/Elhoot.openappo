"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { PdfDownloadButton } from "@/components/PdfDownloadButton";
import { InvoiceImageDownloadButton } from "@/components/InvoiceImageDownloadButton";
import CustomerPaymentModal from "@/components/CustomerPaymentModal";

export default function PrintActions({
  autoprint,
  backLink = "/sales",
  backLabel = "↩️ عودة",
  fileName = "فاتورة شركة الحوت",
  targetId = "statement",
  invoiceId,
  customerId,
  customerName,
  isCancelled,
}: {
  autoprint?: boolean;
  backLink?: string;
  backLabel?: string;
  fileName?: string;
  targetId?: string;
  invoiceId?: string;
  customerId?: string;
  customerName?: string;
  isCancelled?: boolean;
}) {
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  useEffect(() => {
    if (autoprint) {
      const t = setTimeout(() => window.print(), 600);
      return () => clearTimeout(t);
    }
  }, [autoprint]);

  function handleClose() {
    try {
      window.close();
    } catch {}
    setTimeout(() => {
      window.location.href = backLink;
    }, 150);
  }

  return (
    <>
      <div className="no-print max-w-[660px] mx-auto mt-4 mb-8 flex flex-wrap gap-2 justify-center items-center">
        {/* زر صورة واتساب + نسخ */}
        <InvoiceImageDownloadButton targetId={targetId} fileName={fileName} label="🖼️ حفظ صورة واتساب" />

        {/* زر الطباعة */}
        <button
          onClick={() => window.print()}
          className="bg-elhoot-500 hover:bg-elhoot-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
        >
          <span>🖨️</span>
          <span>طباعة</span>
        </button>

        {/* زر PDF */}
        <PdfDownloadButton targetId={targetId} fileName={fileName} label="📄 PDF" />

        {/* زر تحصيل */}
        {customerId && !isCancelled && (
          <button
            onClick={() => setShowPaymentModal(true)}
            className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
            title="تسجيل دفعة جديدة من العميل"
          >
            <span>💳</span>
            <span>تحصيل</span>
          </button>
        )}

        {/* زر إغلاق التبويب */}
        <button
          onClick={handleClose}
          className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 px-4 py-2 rounded-xl text-sm font-bold shadow-sm transition-all flex items-center gap-1 cursor-pointer active:scale-95"
          title="إغلاق هذا التبويب"
        >
          <span>✕</span>
          <span>إغلاق</span>
        </button>
      </div>

      {showPaymentModal && customerId && (
        <CustomerPaymentModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          defaultCustomerId={customerId}
          defaultCustomerName={customerName}
          defaultInvoiceId={invoiceId}
          onSuccess={() => {
            setShowPaymentModal(false);
            // تحديث الصفحة تلقائياً لتنعكس بيانات التحصيل فوراً في الطباعة
            window.location.reload();
          }}
        />
      )}
    </>
  );
}

