"use client";

import { useState } from "react";

// تحويل أي لون oklch إلى rgb لضمان توافق html2canvas
function convertOklchToRgb(str: string, ctx: CanvasRenderingContext2D | null): string {
  if (!str || typeof str !== "string" || !str.includes("oklch")) return str;
  if (!ctx) return str.replace(/oklch\([^)]+\)/gi, "rgb(0,0,0)");
  return str.replace(/oklch\([^)]+\)/gi, (match) => {
    try {
      ctx.fillStyle = "#000000";
      ctx.fillStyle = match;
      return ctx.fillStyle;
    } catch {
      return "rgb(0,0,0)";
    }
  });
}

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

    const html2canvas = (await import("html2canvas")).default;

    // مقياس scale: 3 لإنتاج صورة فائقة الوضوح والدقة للأرقام والنصوص في شاشات الموبايل والواتساب
    const canvas = await html2canvas(targetElement, {
      useCORS: true,
      allowTaint: true,
      scale: 3,
      logging: false,
      backgroundColor: "#ffffff",
      scrollX: 0,
      scrollY: 0,
      onclone: (clonedDoc, clonedElement) => {
        const tempCanvas = clonedDoc.createElement("canvas");
        const ctx = tempCanvas.getContext("2d");

        const styleTags = clonedDoc.querySelectorAll("style");
        styleTags.forEach((styleTag) => {
          if (styleTag.textContent && styleTag.textContent.includes("oklch")) {
            styleTag.textContent = convertOklchToRgb(styleTag.textContent, ctx);
          }
        });

        const origAll = [
          targetElement,
          ...Array.from(targetElement.querySelectorAll("*")),
        ] as HTMLElement[];
        const clonedAll = [
          clonedElement,
          ...Array.from(clonedElement.querySelectorAll("*")),
        ] as HTMLElement[];

        const COLOR_PROPS = [
          "color",
          "backgroundColor",
          "borderColor",
          "borderTopColor",
          "borderBottomColor",
          "borderLeftColor",
          "borderRightColor",
          "outlineColor",
          "boxShadow",
          "textShadow",
        ];

        for (let i = 0; i < origAll.length; i++) {
          const orig = origAll[i];
          const clone = clonedAll[i];
          if (!orig || !clone) continue;

          if (clone.style) {
            for (let s = 0; s < clone.style.length; s++) {
              const prop = clone.style[s];
              const val = clone.style.getPropertyValue(prop);
              if (val && val.includes("oklch")) {
                clone.style.setProperty(prop, convertOklchToRgb(val, ctx));
              }
            }
          }

          try {
            const computed = window.getComputedStyle(orig);
            for (const prop of COLOR_PROPS) {
              const val = (computed as any)[prop];
              if (val && typeof val === "string" && val.includes("oklch")) {
                const rgbVal = convertOklchToRgb(val, ctx);
                const cssProp = prop.replace(/([A-Z])/g, "-$1").toLowerCase();
                clone.style.setProperty(cssProp, rgbVal, "important");
              }
            }
          } catch {}
        }
      },
    });

    return canvas;
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
        className="hidden sm:inline-flex bg-slate-800 hover:bg-slate-900 text-white px-3.5 py-2 rounded-xl text-sm font-bold shadow-sm transition-all items-center gap-1.5 active:scale-95 disabled:cursor-not-allowed cursor-pointer border border-slate-700"
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
