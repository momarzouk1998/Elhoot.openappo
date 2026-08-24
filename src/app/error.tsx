"use client";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-xl w-full bg-white rounded-2xl shadow-lg p-8 border border-red-200">
          <div className="text-5xl mb-3">⚠️</div>
          <h1 className="text-2xl font-bold text-red-700 mb-2">حدث خطأ في الصفحة</h1>
          <p className="text-gray-700 mb-4">{error.message || "خطأ غير معروف"}</p>
          {error.digest && <p className="text-xs text-gray-500 mb-4">Digest: <code>{error.digest}</code></p>}
          <button onClick={() => reset()} className="w-full bg-orange-600 hover:bg-orange-700 text-white font-medium py-2.5 px-4 rounded-xl transition">
            حاول مرة أخرى
          </button>
        </div>
      </body>
    </html>
  );
}
