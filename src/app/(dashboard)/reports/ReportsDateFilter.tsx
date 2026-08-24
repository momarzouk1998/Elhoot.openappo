"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function ReportsDateFilter({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const [fromDate, setFromDate] = useState(from);
  const [toDate, setToDate] = useState(to);

  function apply() {
    const params = new URLSearchParams();
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);
    const qs = params.toString();
    router.push(qs ? `/reports?${qs}` : '/reports');
  }

  function clear() {
    setFromDate('');
    setToDate('');
    router.push('/reports');
  }

  function setPreset(preset: 'today' | 'week' | 'month' | 'quarter' | 'year') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let from = new Date(today);
    switch (preset) {
      case 'week': from.setDate(today.getDate() - 7); break;
      case 'month': from.setMonth(today.getMonth(), 1); break;
      case 'quarter': from.setMonth(today.getMonth() - 2, 1); break;
      case 'year': from.setMonth(0, 1); break;
    }
    setFromDate(from.toISOString().slice(0, 10));
    setToDate(today.toISOString().slice(0, 10));
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-sm font-medium block mb-1">من تاريخ</label>
          <input type="date" className="input-field" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">إلى تاريخ</label>
          <input type="date" className="input-field" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        <button onClick={apply} className="btn-primary">🔍 تطبيق</button>
        {(fromDate || toDate) && (
          <button onClick={clear} className="btn-secondary">مسح الفلتر (كل الفترات)</button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <span className="text-xs text-gray-500 self-center">اختصارات:</span>
        <button onClick={() => setPreset('today')} className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200">اليوم</button>
        <button onClick={() => setPreset('week')} className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200">آخر 7 أيام</button>
        <button onClick={() => setPreset('month')} className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200">هذا الشهر</button>
        <button onClick={() => setPreset('quarter')} className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200">آخر 3 شهور</button>
        <button onClick={() => setPreset('year')} className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200">هذا العام</button>
      </div>
    </div>
  );
}
