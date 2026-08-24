"use client";
import { useState } from "react";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { formatEGP, formatQty } from "@/lib/format";
import { useRouter } from "next/navigation";
import SearchableSelect, { type SearchOption } from "@/components/SearchableSelect";

interface Product {
  id: string;
  name: string;
  unit: string;
  last_purchase_price: number;
  total_stock: number;
  inventory_items?: { current_stock: number; store_id: string }[];
}
interface Supplier { id: string; name: string; balance: number; phone?: string | null; }
interface Store { id: string; name: string; type: string; }
interface CartItem {
  product_id: string;
  product_name: string;
  store_id: string;
  store_name: string;
  quantity: number;
  unit_cost: number;
  available: number;
}

export default function NewSupplierReturnPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [originalPurchaseId, setOriginalPurchaseId] = useState("");
  const [notes, setNotes] = useState("");

  const { mutate, loading: saving } = useApiMutation();
  const { data: productsData } = useApi<{ items: Product[] }>(`/api/products?search=${encodeURIComponent(search)}&limit=30`);
  const { data: suppliersData } = useApi<{ items: Supplier[] }>("/api/suppliers?limit=200");
  const { data: storesData } = useApi<{ items: Store[] }>("/api/stores");

  const stores = storesData?.items || [];
  const defaultStoreId = stores[0]?.id || "";

  const total = cart.reduce((s, i) => s + i.quantity * i.unit_cost, 0);

  function stockFor(p: Product, storeId: string): number {
    return Number(p.inventory_items?.find(i => i.store_id === storeId)?.current_stock ?? 0);
  }

  function addToCart(p: Product) {
    if (!defaultStoreId) { alert("لا يوجد مخازن معرفة"); return; }
    const available = stockFor(p, defaultStoreId);
    if (available <= 0) {
      alert(`⚠️ لا يوجد مخزون للصنف "${p.name}" في المخزن المختار.\nاختر مخزناً آخر أو تأكد من المخزون.`);
    }
    const existing = cart.find(c => c.product_id === p.id && c.store_id === defaultStoreId);
    if (existing) {
      setCart(cart.map(c => c.product_id === p.id && c.store_id === defaultStoreId
        ? { ...c, quantity: c.quantity + 1 }
        : c
      ));
    } else {
      const store = stores.find(s => s.id === defaultStoreId);
      setCart([...cart, {
        product_id:   p.id,
        product_name: p.name,
        store_id:     defaultStoreId,
        store_name:   store?.name || "",
        quantity:     1,
        unit_cost:    Number(p.last_purchase_price),
        available,
      }]);
    }
  }

  function updateItem(idx: number, field: keyof CartItem, value: any) {
    setCart(cart.map((c, i) => {
      if (i !== idx) return c;
      const next = { ...c, [field]: value };
      if (field === "quantity") {
        const q = Number(value);
        next.quantity = Number.isFinite(q) && q > 0 ? q : 0;
      }
      if (field === "unit_cost") {
        const v = Number(value);
        next.unit_cost = Number.isFinite(v) && v >= 0 ? v : 0;
      }
      return next;
    }));
  }

  function adjustQty(idx: number, delta: number) {
    const c = cart[idx];
    if (!c) return;
    updateItem(idx, "quantity", Math.max(1, c.quantity + delta));
  }

  function removeItem(idx: number) {
    setCart(cart.filter((_, i) => i !== idx));
  }

  async function save() {
    if (cart.length === 0) { alert("السلة فارغة"); return; }
    const validItems = cart.filter(c => c.quantity > 0 && c.unit_cost >= 0 && c.store_id);
    if (validItems.length === 0) { alert("❌ كل الأصناف لها كمية أو سعر غير صالح"); return; }
    if (!supplierId) {
      if (!confirm("لم تختر مورداً. هل تريد المتابعة؟")) return;
    }

    const totalAmount = validItems.reduce((s, i) => s + i.quantity * i.unit_cost, 0);

    const { error, data } = await mutate<{ id: string; return_number: number }>(
      "POST",
      "/api/returns/supplier",
      {
        supplier_id:          supplierId || null,
        original_purchase_id: originalPurchaseId || null,
        total_amount:         totalAmount,
        notes,
        items: validItems.map(c => ({
          product_id: c.product_id,
          store_id:   c.store_id,
          quantity:   c.quantity,
          unit_cost:  c.unit_cost,
        })),
      }
    );

    if (error) { alert("❌ " + error); return; }
    alert(`✅ تم حفظ مرتجع المورد رقم ${data?.return_number}\nتم خصم الكميات من المخزون وخصم المبلغ من رصيد المورد.`);
    router.push("/returns/supplier");
  }

  const supplierOptions: SearchOption[] = (suppliersData?.items || []).map(s => ({
    id: s.id,
    name: s.name,
    sub: s.phone || undefined,
    extra: `مستحق: ${formatEGP(s.balance)} ج`,
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Products panel */}
      <div className="lg:col-span-2 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-extrabold text-slate-650">↩️ مرتجع مورد جديد</h1>
          <button onClick={() => router.push("/returns/supplier")} className="btn-secondary text-sm">↩️ رجوع</button>
        </div>

        <div className="card bg-purple-50 border border-purple-200 text-sm text-purple-800 p-3 rounded-lg">
          <strong>📋 تأثير المرتجع:</strong> الكميات ستُخصم من المخزون، والمبلغ سيُخصم من رصيد المورد.
        </div>

        <div className="card">
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍 ابحث عن صنف بالاسم..."
            className="input-field"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[500px] overflow-y-auto">
          {productsData?.items.map(p => {
            const available = stockFor(p, defaultStoreId);
            return (
              <button
                key={p.id}
                onClick={() => addToCart(p)}
                className={`card text-right transition-all p-3 ${
                  available <= 0
                    ? "opacity-60 hover:border-red-300"
                    : "hover:border-purple-400 hover:shadow-lg"
                }`}
              >
                <div className="font-semibold text-sm line-clamp-2">{p.name}</div>
                <div className="flex items-center justify-between mt-2 text-xs">
                  <span className="text-purple-600 font-bold">آخر سعر: {formatEGP(p.last_purchase_price)} ج</span>
                  <span className={`font-mono ${available <= 0 ? "text-red-500" : "text-gray-600"}`}>
                    مخزون: {formatQty(available)}
                  </span>
                </div>
              </button>
            );
          })}
          {search.trim() !== "" && productsData?.items.length === 0 && (
            <div className="col-span-full card p-4 text-center text-gray-400">لا توجد نتائج لـ "{search}"</div>
          )}
          {search.trim() === "" && productsData?.items.length === 0 && (
            <div className="col-span-full card text-center text-gray-400 py-12">ابدأ بكتابة اسم الصنف للبحث</div>
          )}
        </div>
      </div>

      {/* Cart panel */}
      <div className="space-y-3">
        <div className="card space-y-3">
          <h2 className="font-bold text-lg">🛍️ الأصناف المرتجعة ({cart.length})</h2>

          <div>
            <label className="text-xs text-gray-600 block mb-1">المورد</label>
            <SearchableSelect
              options={supplierOptions}
              value={supplierId}
              onChange={setSupplierId}
              placeholder="🔍 ابحث عن مورد..."
              emptyLabel="— بدون مورد —"
            />
          </div>

          <div>
            <label className="text-xs text-gray-600 block mb-1">رقم فاتورة الشراء الأصلية (اختياري)</label>
            <input
              type="text"
              className="input-field text-sm"
              placeholder="مثال: 456"
              value={originalPurchaseId}
              onChange={e => setOriginalPurchaseId(e.target.value)}
            />
          </div>
        </div>

        {/* Cart items */}
        <div className="card max-h-[320px] overflow-y-auto p-2">
          {cart.length === 0 ? (
            <div className="text-center text-gray-400 py-8 text-sm">لا يوجد أصناف بعد</div>
          ) : (
            <div className="space-y-2">
              {cart.map((c, i) => (
                <div key={i} className="bg-purple-50 rounded-lg p-2 text-sm border border-purple-100">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="font-semibold flex-1 line-clamp-2">{c.product_name}</div>
                    <button onClick={() => removeItem(i)} className="text-red-500 text-xs shrink-0">✕</button>
                  </div>
                  {c.quantity > c.available && c.available > 0 && (
                    <div className="text-xs text-red-600 font-bold mb-1">⚠️ الكمية أكبر من المخزون المتاح ({formatQty(c.available)})</div>
                  )}
                  <div className="grid grid-cols-3 gap-2 items-end">
                    <div>
                      <label className="text-[10px] text-gray-500 block mb-0.5">الكمية</label>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => adjustQty(i, -1)} className="w-6 h-7 shrink-0 rounded bg-gray-200 text-gray-700 font-bold hover:bg-gray-300">−</button>
                        <input
                          type="number"
                          min={1}
                          step="any"
                          className="input-field text-xs p-1 text-center w-full"
                          value={c.quantity}
                          onChange={e => updateItem(i, "quantity", parseFloat(e.target.value) || 1)}
                        />
                        <button type="button" onClick={() => adjustQty(i, 1)} className="w-6 h-7 shrink-0 rounded bg-gray-200 text-gray-700 font-bold hover:bg-gray-300">+</button>
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 block mb-0.5">سعر الشراء (ج)</label>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        className="input-field text-xs p-1"
                        value={c.unit_cost === 0 ? '' : c.unit_cost}
                        onChange={e => updateItem(i, "unit_cost", parseFloat(e.target.value) || 0)}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 block mb-0.5">الإجمالي</label>
                      <div className="text-xs font-bold text-purple-600 text-center p-1 bg-white rounded border">
                        {formatEGP(c.quantity * c.unit_cost)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-1">
                    <label className="text-[10px] text-gray-500 block mb-0.5">المخزن (مصدر الإرجاع)</label>
                    <select
                      className="input-field text-[11px] p-1"
                      value={c.store_id}
                      onChange={e => {
                        const newStoreId = e.target.value;
                        const newStore = stores.find(s => s.id === newStoreId);
                        const prod = productsData?.items.find(p => p.id === c.product_id);
                        const newAvailable = prod ? stockFor(prod, newStoreId) : 0;
                        setCart(cart.map((row, idx) => idx === i
                          ? { ...row, store_id: newStoreId, store_name: newStore?.name || "", available: newAvailable }
                          : row
                        ));
                      }}
                    >
                      {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <div className="text-[10px] text-gray-500 mt-0.5">متاح: {formatQty(c.available)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card space-y-2">
          <div className="flex justify-between text-lg font-extrabold border-t pt-2">
            <span>إجمالي المرتجع:</span>
            <span className="text-purple-600">{formatEGP(total)} ج</span>
          </div>
          <textarea
            className="input-field text-xs"
            rows={2}
            placeholder="ملاحظات (اختياري)"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
          <button
            onClick={save}
            disabled={saving || cart.length === 0}
            className="w-full py-2.5 px-4 rounded-xl font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "⏳ جاري الحفظ..." : `✅ حفظ المرتجع (${formatEGP(total)} ج)`}
          </button>
        </div>
      </div>
    </div>
  );
}
