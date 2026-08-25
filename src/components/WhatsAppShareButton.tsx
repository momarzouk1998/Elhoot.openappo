"use client";

import { useState } from "react";

export function WhatsAppShareButton({
  targetId = "statement",
  fileName = "كشف_حساب_شركة_الحوت",
  recipientPhone,
  recipientName,
  title = "كشف الحساب",
}: {
  targetId?: string;
  fileName?: string;
  recipientPhone?: string | null;
  recipientName?: string | null;
  title?: string;
}) {
  const [sharing, setSharing] = useState(false);

  const handleShare = async () => {
    if (sharing) return;
    const targetElement = (
      (targetId ? document.getElementById(targetId) : null) ||
      document.getElementById("statement") ||
      document.querySelector(".print-page") ||
      document.querySelector("[id*='statement']")
    ) as HTMLElement | null;

    if (!targetElement) {
      alert("❌ تعذر العثور على محتوى المستند");
      return;
    }

    try {
      setSharing(true);
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(targetElement, {
        useCORS: true,
        allowTaint: true,
        scale: 2.5,
        backgroundColor: "#ffffff",
        scrollX: 0,
        scrollY: 0,
      });

      const cleanPhone = recipientPhone ? String(recipientPhone).replace(/\D/g, "") : "";
      const formattedPhone = cleanPhone.startsWith("0") ? `2${cleanPhone}` : cleanPhone;
      const name = recipientName || "العميل المحترم";
      const shareText = `مرحباً بك أستاذ ${name}،\nمرفق ${title} الخاص بكم من شركة الحوت للأدوات واللوحات الكهربائية.\nشكراً لتعاملكم معنا.`;

      // 1. Native Mobile Web Share API
      if (typeof navigator !== "undefined" && typeof (navigator as any).canShare === "function") {
        try {
          const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
          if (blob) {
            const file = new File([blob as BlobPart], `${fileName}.png`, { type: "image/png" });
            if ((navigator as any).canShare({ files: [file] })) {
              await navigator.share({
                files: [file],
                title: `${title} - شركة الحوت`,
                text: shareText,
              });
              return;
            }
          }
        } catch (shareErr: any) {
          if (shareErr?.name === "AbortError") return;
          console.warn("Native share failed, fallback to direct download & WhatsApp link", shareErr);
        }
      }

      // 2. Fallback: Download image and open WhatsApp chat
      const link = document.createElement("a");
      link.download = `${fileName}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();

      const waUrl = formattedPhone
        ? `https://wa.me/${formattedPhone}?text=${encodeURIComponent(shareText)}`
        : `https://wa.me/?text=${encodeURIComponent(shareText)}`;
      window.open(waUrl, "_blank");
    } catch (err) {
      console.error(err);
      alert("❌ حدث خطأ أثناء إرسال كشف الحساب عبر واتساب");
    } finally {
      setSharing(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      disabled={sharing}
      className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
      title="إرسال صورة كشف الحساب مباشرة للعميل على واتساب"
    >
      <span>{sharing ? "⏳" : "📲"}</span>
      <span>{sharing ? "جاري التجهيز..." : "إرسال واتساب"}</span>
    </button>
  );
}
