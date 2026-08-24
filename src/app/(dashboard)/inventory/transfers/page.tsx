"use client";
import { useEffect, useState } from "react";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { formatQty, formatDate } from "@/lib/format";

interface Transfer {
  id: string;
  transfer_date: string;
  product_name: string;
  quantity: number;
  status: string;
  notes: string | null;
  from_store?: { id: string; name: string } | null;
  to_store?: { id: string; name: string } | null;
  by_user?: { id: number; full_name: string } | null;
}
interface ApiResponse {
  items: Transfer[];
  total: number;
}

interface Store {
  id: string;
  name: string;
}

interface InventoryItem {
  id: string;
  product_id: string;
  store_id: string;
  current_stock: number;
  product: {
    id: string;
    name: string;
    category?: string | null;
    unit?: string;
  };
}

export default function TransfersPage() {
  const [showTransfer, setShowTransfer] = useState(false);
  const { data, loading, refetch } = useApi<ApiResponse>("/api/transfers?limit=200");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-650">🚛 تحويلات المخازن</h1>
          <p className="text-sm text-gray-500">{data?.total ?? "..."} تحويل</p>
        </div>
        <button
          onClick={() => setShowTransfer(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
        >
          🔄 تحويل بين المخازن
        </button>
      </div>

      {loading ? (
        <div className="card text-center py-12 text-gray-500">⏳ جاري التحميل...</div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3 text-right">التاريخ</th>
                <th className="p-3 text-right">المنتج</th>
                <th className="p-3 text-right">من مخزن</th>
                <th className="p-3 text-right">إلى مخزن</th>
                <th className="p-3 text-right">الكمية</th>
                <th className="p-3 text-right">الحالة</th>
                <th className="p-3 text-right">بواسطة</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((t) => (
                <tr key={t.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 text-xs">{formatDate(t.transfer_date)}</td>
                  <td className="p-3 font-semibold">{t.product_name}</td>
                  <td className="p-3 text-xs">{t.from_store?.name || "—"}</td>
                  <td className="p-3 text-xs">{t.to_store?.name || "—"}</td>
                  <td className="p-3 font-mono font-bold">{formatQty(t.quantity)}</td>
                  <td className="p-3">
                    <span className="badge bg-green-100 text-green-800">{t.status}</span>
                  </td>
                  <td className="p-3 text-xs text-gray-600">{t.by_user?.full_name || "—"}</td>
                </tr>
              ))}
              {data?.items.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-gray-400">
                    لا توجد تحويلات
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showTransfer && (
        <BulkTransferModal
          onClose={() => setShowTransfer(false)}
          onSaved={() => {
            setShowTransfer(false);
            refetch();
          }}
        />
      )}
    </div>
  );
}

// 📦 مودال التحويل بين المخازن (تحويل صنف واحد أو عدة أصناف أو كل الأصناف)
function BulkTransferModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [fromStoreId, setFromStoreId] = useState("");
  const [toStoreId, setToStoreId] = useState("");
  const [notes, setNotes] = useState("");
  const [transferDate, setTransferDate] = useState("");
  const [stores, setStores] = useState<Store[]>([]);
  const [loadingStores, setLoadingStores] = useState(true);

  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);

  // الأصناف المحددة مع كمياتها: { [productId]: { selected: boolean, quantity: number, maxQty: number, name: string } }
  const [selectedItems, setSelectedItems] = useState<{
    [productId: string]: { selected: boolean; quantity: number; maxQty: number; name: string };
  }>({});

  const [search, setSearch] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  const { mutate, loading: saving } = useApiMutation();

  // 1. جلب قائمة المخازن
  useEffect(() => {
    fetch("/api/stores")
      .then((r) => r.json())
      .then((j) => {
        const items = j.data?.items || [];
        setStores(items);
        if (items.length > 0) {
          setFromStoreId(items[0].id);
          if (items.length > 1) {
            setToStoreId(items[1].id);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingStores(false));
  }, []);

  // 2. جلب أصناف المخزن المصدر عند تغييره
  useEffect(() => {
    if (!fromStoreId) {
      setInventoryItems([]);
      setSelectedItems({});
      return;
    }

    setLoadingInventory(true);
    fetch(`/api/inventory?store_id=${fromStoreId}&limit=5000`)
      .then((r) => r.json())
      .then((j) => {
        const raw = (j.data?.items || []) as InventoryItem[];
        // فقط الأصناف التي لديها رصيد فعلي أكبر من 0
        const available = raw.filter((inv) => Number(inv.current_stock) > 0);
        setInventoryItems(available);

        // افتراضياً تحديد الكل مع كامل رصيد كل صنف
        const initialSelected: {
          [id: string]: { selected: boolean; quantity: number; maxQty: number; name: string };
        } = {};
        available.forEach((inv) => {
          const qty = Number(inv.current_stock);
          initialSelected[inv.product_id] = {
            selected: true,
            quantity: qty,
            maxQty: qty,
            name: inv.product.name,
          };
        });
        setSelectedItems(initialSelected);
      })
      .catch(() => {})
      .finally(() => setLoadingInventory(false));
  }, [fromStoreId]);

  // تصفية الأصناف بالبحث
  const filteredItems = inventoryItems.filter((inv) =>
    inv.product.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  // حساب عدد الأصناف المحددة وإجمالي الكمية
  const selectedEntries = Object.entries(selectedItems).filter(([_, val]) => val.selected && val.quantity > 0);
  const selectedCount = selectedEntries.length;
  const totalQuantity = selectedEntries.reduce((sum, [_, val]) => sum + val.quantity, 0);

  const allFilteredSelected =
    filteredItems.length > 0 &&
    filteredItems.every((inv) => selectedItems[inv.product_id]?.selected);

  // دالة تحديد / إلغاء تحديد الكل
  function toggleSelectAll() {
    const nextState = !allFilteredSelected;
    setSelectedItems((prev) => {
      const updated = { ...prev };
      filteredItems.forEach((inv) => {
        if (updated[inv.product_id]) {
          updated[inv.product_id].selected = nextState;
        }
      });
      return updated;
    });
  }

  // تعيين كامل الرصيد لكل صنف
  function setAllToMaxQuantity() {
    setSelectedItems((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach((id) => {
        updated[id].quantity = updated[id].maxQty;
      });
      return updated;
    });
  }

  // تحديث حالة تحديد صنف
  function toggleItem(productId: string) {
    setSelectedItems((prev) => {
      const cur = prev[productId];
      if (!cur) return prev;
      return {
        ...prev,
        [productId]: { ...cur, selected: !cur.selected },
      };
    });
  }

  // تحديث كمية صنف
  function updateItemQty(productId: string, val: number) {
    setSelectedItems((prev) => {
      const cur = prev[productId];
      if (!cur) return prev;
      const validVal = Math.max(0, Math.min(cur.maxQty, val));
      return {
        ...prev,
        [productId]: { ...cur, quantity: validVal },
      };
    });
  }

  const fromStoreName = stores.find((s) => s.id === fromStoreId)?.name || "المخزن المصدر";
  const toStoreName = stores.find((s) => s.id === toStoreId)?.name || "المخزن الوجهة";

  // حفظ التحويل الجماعي
  async function executeBulkTransfer() {
    if (!fromStoreId || !toStoreId) {
      alert("❌ يرجى اختيار المخزن المصدر والمخزن الوجهة");
      return;
    }
    if (fromStoreId === toStoreId) {
      alert("❌ لا يمكن التحويل لنفس المخزن");
      return;
    }
    if (selectedCount === 0 || totalQuantity <= 0) {
      alert("❌ يرجى تحديد صنف واحد على الأقل بكمية صالحة");
      return;
    }

    const payload = {
      from_store_id: fromStoreId,
      to_store_id: toStoreId,
      notes: notes || `تحويل جماعي (${selectedCount} صنف)`,
      transfer_date: transferDate || undefined,
      items: selectedEntries.map(([productId, val]) => ({
        product_id: productId,
        quantity: val.quantity,
      })),
    };

    const { error, data } = await mutate<{ transfers: any[]; count: number }>("POST", "/api/transfers", payload);
    if (error) {
      alert("❌ " + error);
      return;
    }

    alert(`✅ تم التحويل الجماعي بنجاح!\nعدد الأصناف المحولة: ${data?.count || selectedCount} صنف\nإجمالي الكمية: ${formatQty(totalQuantity)}`);
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col border border-gray-100"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black flex items-center gap-2">
              🔄 تحويل بين المخازن
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">
              تحويل صنف واحد أو عدة أصناف أو كامل المخزون بنقرة واحدة
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Store Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">
                📤 من مخزن (المصدر) *
              </label>
              <select
                className="input-field text-sm font-semibold"
                value={fromStoreId}
                onChange={(e) => setFromStoreId(e.target.value)}
                disabled={loadingStores}
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">
                📥 إلى مخزن (الوجهة) *
              </label>
              <select
                className="input-field text-sm font-semibold"
                value={toStoreId}
                onChange={(e) => setToStoreId(e.target.value)}
                disabled={loadingStores}
              >
                <option value="">-- اختر المخزن المستلم --</option>
                {stores
                  .filter((s) => s.id !== fromStoreId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Items Selector Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-extrabold text-sm text-slate-800 flex items-center gap-1.5">
                📋 أصناف المخزن المصدر المتاحة ({inventoryItems.length})
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  {allFilteredSelected ? "❌ إلغاء تحديد الكل" : "✅ تحديد الكل"}
                </button>
                <button
                  type="button"
                  onClick={setAllToMaxQuantity}
                  className="px-3 py-1 bg-sky-100 hover:bg-sky-200 text-sky-800 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  ⚡ كامل الرصيد المتاح
                </button>
              </div>
            </div>

            {/* Search filter */}
            <input
              type="text"
              placeholder="🔍 ابحث في أصناف المخزن المصدر..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field text-xs"
            />

            {/* Items Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[300px] overflow-y-auto">
              {loadingInventory ? (
                <div className="py-12 text-center text-gray-500 text-sm">
                  ⏳ جاري تحميل أصناف المخزن...
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="py-12 text-center text-gray-400 text-sm">
                  لا توجد أصناف برصيد متاح في هذا المخزن
                </div>
              ) : (
                <table className="w-full text-right text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-700 sticky top-0 font-black border-b border-slate-200">
                    <tr>
                      <th className="p-2.5 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={allFilteredSelected}
                          onChange={toggleSelectAll}
                          className="w-4 h-4 rounded cursor-pointer accent-emerald-600"
                        />
                      </th>
                      <th className="p-2.5">اسم الصنف</th>
                      <th className="p-2.5 text-center">المتاح بالمخزن</th>
                      <th className="p-2.5 text-center w-36">الكمية للتحويل</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredItems.map((inv) => {
                      const itemState = selectedItems[inv.product_id] || {
                        selected: false,
                        quantity: 0,
                        maxQty: Number(inv.current_stock),
                        name: inv.product.name,
                      };
                      const isChecked = itemState.selected;

                      return (
                        <tr
                          key={inv.id}
                          className={`transition-colors ${
                            isChecked ? "bg-emerald-50/40 font-medium" : "hover:bg-gray-50 text-gray-500"
                          }`}
                        >
                          <td className="p-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleItem(inv.product_id)}
                              className="w-4 h-4 rounded cursor-pointer accent-emerald-600"
                            />
                          </td>
                          <td className="p-2.5">
                            <div className="font-bold text-slate-900">{inv.product.name}</div>
                            {inv.product.category && (
                              <span className="text-[10px] text-gray-400">{inv.product.category}</span>
                            )}
                          </td>
                          <td className="p-2.5 text-center font-mono font-bold text-slate-700">
                            {formatQty(itemState.maxQty)}
                          </td>
                          <td className="p-2.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <input
                                type="number"
                                min={0}
                                max={itemState.maxQty}
                                step="any"
                                value={itemState.quantity}
                                onChange={(e) =>
                                  updateItemQty(inv.product_id, parseFloat(e.target.value) || 0)
                                }
                                disabled={!isChecked}
                                className="w-24 input-field text-center text-xs py-1 px-1 font-mono font-bold disabled:opacity-40"
                              />
                              <button
                                type="button"
                                title="تعيين كامل الرصيد"
                                onClick={() => updateItemQty(inv.product_id, itemState.maxQty)}
                                disabled={!isChecked}
                                className="text-[10px] bg-slate-200 hover:bg-slate-300 px-1.5 py-1 rounded font-bold cursor-pointer disabled:opacity-40"
                              >
                                الكل
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Notes and Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">تاريخ التحويل</label>
              <input
                type="date"
                className="input-field text-xs"
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">ملاحظات التحويل</label>
              <input
                type="text"
                placeholder="ملاحظات (اختياري)..."
                className="input-field text-xs"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Footer Summary & Action */}
        <div className="px-6 py-3.5 bg-slate-100 border-t border-slate-200 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-lg font-black text-xs">
              المحدد: {selectedCount} صنف
            </span>
            <span className="bg-sky-100 text-sky-800 px-3 py-1 rounded-lg font-black text-xs font-mono">
              إجمالي الكمية: {formatQty(totalQuantity)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn-secondary text-xs px-4 py-2">
              إلغاء
            </button>
            <button
              onClick={() => {
                if (fromStoreId === toStoreId) {
                  alert("❌ لا يمكن التحويل لنفس المخزن");
                  return;
                }
                if (selectedCount === 0 || totalQuantity <= 0) {
                  alert("❌ يرجى تحديد أصناف للتحويل أولاً");
                  return;
                }
                setShowConfirm(true);
              }}
              disabled={saving || selectedCount === 0 || totalQuantity <= 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-xl text-xs font-black shadow-md transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            >
              {saving ? "⏳ جاري التحويل..." : `🔄 تحويل (${selectedCount}) صنف الآن`}
            </button>
          </div>
        </div>
      </div>

      {/* ⚠️ نافذة التأكيد الواضحة قبل التحويل */}
      {showConfirm && (
        <div
          className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setShowConfirm(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border-2 border-emerald-500 text-center"
          >
            <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-2xl font-bold shadow-inner">
              🔄
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900">تأكيد التحويل الجماعي</h3>
              <p className="text-xs text-slate-600 mt-1">
                يرجى مراجعة تفاصيل التحويل قبل الاعتماد النهائي:
              </p>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl text-right text-xs space-y-2 border border-slate-200">
              <div className="flex justify-between">
                <span className="text-gray-500">من مخزن:</span>
                <strong className="text-slate-800">{fromStoreName}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">إلى مخزن:</span>
                <strong className="text-emerald-700">{toStoreName}</strong>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2">
                <span className="text-gray-500">عدد الأصناف:</span>
                <strong className="text-slate-900">{selectedCount} صنف</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">إجمالي الكمية:</span>
                <strong className="text-emerald-600 font-mono text-sm">
                  {formatQty(totalQuantity)}
                </strong>
              </div>
            </div>

            <p className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200 font-bold">
              ⚠️ سيتم خصم هذه الكميات فوراً من [{fromStoreName}] وإضافتها إلى [{toStoreName}].
            </p>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => {
                  setShowConfirm(false);
                  executeBulkTransfer();
                }}
                disabled={saving}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl font-black text-sm shadow-md transition-all cursor-pointer"
              >
                {saving ? "⏳ جاري التنفيذ..." : "✅ نعم، تأكيد التحويل"}
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl font-bold text-sm cursor-pointer"
              >
                تراجع
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
