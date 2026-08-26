"use client";

import { useState } from "react";
import { captureElementToCanvas } from "@/lib/html2canvas-safe";

export function InvoiceImageDownloadButton({
  targetId = "statement",
  fileName = "فاتورة",
  label = "🖼️ صورة واتساب",
}: {
  targetId?: string;
  fileName?: string;
  label?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const getCanvas = async () => {
    const targetElement = (
      (targetId ? document.getElementById(targetId) : null) ||
      document.getElementById("statement") ||
      document.querySelector(".print-page") ||
      document.querySelector("[id*='statement']")
    ) as HTMLElement | null;

    if (!targetElement) {
      alert("❌ تعذر العثور على محتوى الفاتورة");
      return null;
    }

    return await captureElementToCanvas(targetElement, { scale: 2.5 });
  };

  const handleDownloadImage = async () => {
    if (loading) return;
    setLoading(true);

    try {
      const canvas = await getCanvas();
      if (!canvas) return;

      const link = document.createElement("a");
      link.download = `${fileName}.png`;
      link.href = canvas.toDataURL("image/png", 1.0);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Image generation failed:", error);
      alert("❌ فشل حفظ الصورة، يرجى المحاولة مرة أخرى.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyImage = async () => {
    if (loading) return;
    setLoading(true);

    try {
      const canvas = await getCanvas();
      if (!canvas) return;

      canvas.toBlob(async (blob) => {
        if (!blob) {
          alert("❌ تعذر نسخ الصورة");
          setLoading(false);
          return;
        }

        try {
          if (navigator.clipboard && window.ClipboardItem) {
            await navigator.clipboard.write([
              new ClipboardItem({ "image/png": blob }),
            ]);
            setCopied(true);
            setTimeout(() => setCopied(false), 3000);
          } else {
            alert("📋 يرجى استخدام زر تحميل الصورة للمتصفح الحالي.");
          }
        } catch (err) {
          console.warn("Direct clipboard image failed, falling back to download", err);
          const link = document.createElement("a");
          link.download = `${fileName}.png`;
          link.href = canvas.toDataURL("image/png", 1.0);
          link.click();
        } finally {
          setLoading(false);
        }
      }, "image/png", 1.0);
    } catch (error) {
      console.error("Copy image failed:", error);
      alert("❌ فشل نسخ الصورة.");
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleDownloadImage}
        disabled={loading}
        className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md transition-all flex items-center gap-1.5 active:scale-95 disabled:cursor-not-allowed cursor-pointer"
        title="حفظ الفاتورة كصورة عالية الدقة لإرسالها مباشرة على واتساب"
      >
        {loading ? (
          <>
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" />
            <span>جاري المعالجة...</span>
          </>
        ) : (
          <span>{label}</span>
        )}
      </button>

      <button
        type="button"
        onClick={handleCopyImage}
        disabled={loading}
        className="bg-slate-800 hover:bg-slate-900 text-white px-3.5 py-2 rounded-xl text-sm font-bold shadow-sm transition-all flex items-center gap-1.5 active:scale-95 disabled:cursor-not-allowed cursor-pointer border border-slate-700"
        title="نسخ صورة الفاتورة للصقها فوراً (Ctrl+V) في محادثة الواتساب"
      >
        {copied ? (
          <span className="text-emerald-300 font-extrabold">✓ تم النسخ!</span>
        ) : (
          <span>📋 نسخ للصق</span>
        )}
      </button>
    </div>
  );
}
