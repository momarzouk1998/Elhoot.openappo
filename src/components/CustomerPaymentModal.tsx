"use client";
import { useState, useEffect } from "react";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { formatEGP } from "@/lib/format";

interface CustomerPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  defaultCustomerId?: string;
  defaultCustomerName?: string;
  defaultInvoiceId?: string;
  defaultAmount?: number;
}

const PAYMENT_METHODS = ["نقدي", "إنستاباي", "فودافون كاش", "تحويل بنكي", "شيك"];

export default function CustomerPaymentModal({
  isOpen,
  onClose,
  onSuccess,
  defaultCustomerId,
  defaultCustomerName,
  defaultInvoiceId,
  defaultAmount,
}: CustomerPaymentModalProps) {
  const [customerId, setCustomerId] = useState(defaultCustomerId || "");
  const [amount, setAmount] = useState<string>(defaultAmount ? String(defaultAmount) : "");
  const [paymentMethod, setPaymentMethod] = useState("نقدي");
  const [treasuryId, setTreasuryId] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [custSearch, setCustSearch] = useState("");

  const { data: treasuriesData } = useApi<{ items: { id: string; name: string; current_balance: number }[] }>("/api/treasury");
  const { data: customersData } = useApi<{ items: { id: string; name: string; phone: string | null; balance: number }[] }>("/api/customers?limit=1000");
  const { mutate, loading: saving } = useApiMutation();

  useEffect(() => {
    if (defaultCustomerId) {
      setCustomerId(defaultCustomerId);
    }
  }, [defaultCustomerId]);

  useEffect(() => {
    if (defaultAmount) {
      setAmount(String(defaultAmount));
    }
  }, [defaultAmount]);

  useEffect(() => {
    if (treasuriesData?.items && treasuriesData.items.length > 0 && !treasuryId) {
      setTreasuryId(treasuriesData.items[0].id);
    }
  }, [treasuriesData, treasuryId]);

  if (!isOpen) return null;

  const currentCustomer = customersData?.items.find((c) => c.id === customerId);
  const filteredCustomers = (customersData?.items || []).filter((c) =>
    c.name.toLowerCase().includes(custSearch.toLowerCase()) || (c.phone && c.phone.includes(custSearch))
  );

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (!customerId) {
      alert("❌ الرجاء اختيار العميل");
      return;
    }
    if (!numAmount || numAmount <= 0) {
      alert("❌ الرجاء إدخال مبلغ تحصيل صحيح أكبر من صفر");
      return;
    }
    if (!treasuryId) {
      alert("❌ الرجاء اختيار الخزينة المستلمة");
      return;
    }

    const { error } = await mutate("POST", "/api/payments/customers", {
      customer_id: customerId,
      amount: numAmount,
      payment_method: paymentMethod,
      treasury_id: treasuryId,
      invoice_id: defaultInvoiceId || null,
      payment_date: paymentDate || new Date().toISOString(),
      notes: notes || (defaultInvoiceId ? `تحصيل مرتبط بفاتورة` : null),
    });

    if (error) {
      alert("❌ " + error);
      return;
    }

    alert(`✅ تم تسجيل سند التحصيل بمبلغ ${formatEGP(numAmount)} ج بنجاح وإيداعه في الخزينة`);
    if (onSuccess) onSuccess();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-emerald-100">
        {/* Header */}
        <div className="bg-gradient-to-l from-emerald-600 to-teal-700 p-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">💳</span>
            <div>
              <h3 className="font-extrabold text-base">تسجيل سند تحصيل من عميل</h3>
              <p className="text-xs text-emerald-100">إيداع نقدي/بنكي في الخزينة وخصم من مديونية العميل</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white text-xl font-bold p-1 leading-none rounded-lg hover:bg-white/10"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5 space-y-4">
          {/* Customer Selection or display */}
          {defaultCustomerId && defaultCustomerName ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <span className="text-xs text-emerald-800 font-semibold block mb-0.5">العميل المحدد:</span>
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-emerald-950 text-sm">{defaultCustomerName}</span>
                {currentCustomer && (
                  <span className="text-xs bg-white px-2 py-0.5 rounded-full border border-emerald-200 text-emerald-700 font-bold font-mono">
                    المديونية: {formatEGP(currentCustomer.balance)} ج
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">اختر العميل *</label>
              <input
                type="text"
                placeholder="🔍 بحث بالاسم أو الهاتف..."
                value={custSearch}
                onChange={(e) => setCustSearch(e.target.value)}
                className="input-field text-xs p-1.5 mb-1.5 w-full"
              />
              <select
                className="input-field text-sm w-full font-semibold"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                required
              >
                <option value="">— اختر العميل —</option>
                {filteredCustomers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.phone ? `(${c.phone})` : ""} — [مديونية: {formatEGP(c.balance)} ج]
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Amount and Method */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">المبلغ المحصل (ج) *</label>
              <input
                type="number"
                min="0.01"
                step="any"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="input-field text-base font-bold font-mono text-emerald-800 border-emerald-300 focus:border-emerald-500 focus:ring-emerald-500 w-full"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">طريقة الدفع *</label>
              <select
                className="input-field text-sm w-full"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Treasury & Payment Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">الخزينة المستلمة *</label>
              <select
                className="input-field text-xs w-full"
                value={treasuryId}
                onChange={(e) => setTreasuryId(e.target.value)}
                required
              >
                <option value="">— اختر الخزينة —</option>
                {(treasuriesData?.items || []).map((t) => (
                  <option key={t.id} value={t.id}>
                    🏦 {t.name} (رصيد: {formatEGP(t.current_balance)} ج)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">تاريخ التحصيل</label>
              <input
                type="date"
                className="input-field text-xs w-full"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1">ملاحظات / رقم الإيصال (اختياري)</label>
            <input
              type="text"
              placeholder="مثال: دفعة نقدية مع الطلبية..."
              className="input-field text-xs w-full"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary text-xs px-4 py-2"
              disabled={saving}
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-5 py-2 rounded-lg shadow transition-all disabled:opacity-50"
            >
              {saving ? "⏳ جاري التسجيل..." : `💾 تأكيد حفظ التحصيل (${amount ? formatEGP(parseFloat(amount) || 0) : 0} ج)`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
