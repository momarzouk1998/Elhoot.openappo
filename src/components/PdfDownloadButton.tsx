"use client";

import { useState } from "react";
import { captureElementToCanvas } from "@/lib/html2canvas-safe";

export function PdfDownloadButton({
  targetId = "statement",
  fileName = "كشف حساب",
  orientation = "portrait",
  label = "📄 PDF",
}: {
  targetId?: string;
  fileName?: string;
  orientation?: "portrait" | "landscape";
  label?: string;
}) {
  const [loading, setLoading] = useState(false);

  const handleDownloadPdf = async () => {
    if (loading) return;
    setLoading(true);

    try {
      const statementElement = (
        (targetId ? document.getElementById(targetId) : null) ||
        document.getElementById("statement") ||
        document.getElementById("inventory-report") ||
        document.querySelector(".print-page") ||
        document.querySelector(".printable-statement-content") ||
        document.querySelector("[id*='statement']")
      ) as HTMLElement | null;

      if (!statementElement) {
        alert("❌ تعذر العثور على محتوى المستند للتحميل");
        return;
      }

      const { jsPDF } = await import("jspdf");
      const canvas = await captureElementToCanvas(statementElement, { scale: 2 });

      const imgData = canvas.toDataURL("image/jpeg", 0.95);

      const pdf = new jsPDF(orientation === "landscape" ? "l" : "p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;

      if (imgHeight <= pdfHeight) {
        pdf.addImage(imgData, "JPEG", 0, 0, imgWidth, imgHeight);
      } else {
        let heightLeft = imgHeight;
        let position = 0;

        pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;

        while (heightLeft > 0) {
          position = heightLeft - imgHeight;
          pdf.addPage();
          pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
          heightLeft -= pdfHeight;
        }
      }

      pdf.save(`${fileName}.pdf`);
    } catch (error) {
      console.error("PDF generation failed:", error);
      alert("❌ فشل إنشاء ملف الـ PDF، يرجى استخدام زر الطباعة العادي.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleDownloadPdf}
      disabled={loading}
      className="bg-red-700 hover:bg-red-800 disabled:bg-gray-400 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md transition-all flex items-center justify-center gap-1.5 active:scale-95 disabled:cursor-not-allowed cursor-pointer"
      title="تحميل كملف PDF عالي الجودة"
    >
      {loading ? (
        <>
          <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" />
          <span>جاري التحميل...</span>
        </>
      ) : (
        <span>{label}</span>
      )}
    </button>
  );
}
