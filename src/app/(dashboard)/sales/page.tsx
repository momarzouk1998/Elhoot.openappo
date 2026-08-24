"use client";
import { useState, useEffect } from "react";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { formatEGP, formatDate, statusColor, matchesArabicSearch } from "@/lib/format";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import SearchableSelect, { type SearchOption } from "@/components/SearchableSelect";
import CustomerPaymentModal from "@/components/CustomerPaymentModal";
import { getCurrentUserClient } from "@/hooks/useCurrentUser";
import Pagination from "@/components/Pagination";

// ─── Types ────────────────────────────────────────────────
interface Invoice {
  id: string; invoice_number: number; invoice_date: string;
  invoice_type: string; status: string; total: number;
  customer_id?: string | null;
  customer: { id?: string; name: string } | null; store: { name: string } | null;
  creator?: { full_name: string } | null;
  _count: { items: number }; subtotal?: number; discount?: number; paid_amount?: number;
}
interface CustomerReturn {
  id: string; return_number: number; return_date: string;
  status: string; total_amount: number; notes: string | null;
  customer: { id: string; name: string } | null;
  creator?: { full_name: string } | null;
  _count: { items: number };
}

// ─── Tab bar ──────────────────────────────────────────────
type Tab = "sales" | "returns";

export default function SalesPage() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(searchParams.get("tab") === "returns" ? "returns" : "sales");
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    getCurrentUserClient().then(p => {
      if (p?.role === "admin" || p?.role === "accountant" || p?.role === "manager") {
        setIsAdmin(true);
      }
    });
  }, []);

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-0 border-b border-gray-200">
        <TabBtn active={tab === "sales"} onClick={() => setTab("sales")} color="nazlawy">
          🛒 فواتير المبيعات
        </TabBtn>
        <TabBtn active={tab === "returns"} onClick={() => setTab("returns")} color="orange">
          ↩️ مرتجعات العملاء
        </TabBtn>
      </div>

      {tab === "sales"   && <SalesTab   isAdmin={isAdmin} />}
      {tab === "returns" && <CustomerReturnsTab isAdmin={isAdmin} />}
    </div>
  );
}

function TabBtn({ active, onClick, color, children }: {
  active: boolean; onClick: () => void; color: string; children: React.ReactNode;
}) {
  const activeClass = color === "orange"
    ? "border-orange-500 text-orange-600 bg-orange-50"
    : "border-nazlawy-500 text-nazlawy-600 bg-nazlawy-50";
  return (
    <button
      onClick={onClick}
      className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
        active ? activeClass : "border-transparent text-gray-500 hover:text-gray-700"
      }`}
    >
      {children}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB 1 — فواتير المبيعات
// ═══════════════════════════════════════════════════════════
function SalesTab({ isAdmin }: { isAdmin: boolean }) {
  const [customerId, setCustomerId] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [openInvoice, setOpenInvoice] = useState<Invoice | string | null>(null);
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (status) params.set("status", status);
  if (customerId) params.set("customer_id", customerId);
  params.set("page", page.toString());
  const { data, loading, refetch } = useApi<{ items: Invoice[]; total: number; limit: number; page: number }>(
    `/api/sales/invoices?${params.toString()}&limit=50`
  );

  useEffect(() => {
    const pageParam = searchParams.get('page');
    if (pageParam) setPage(parseInt(pageParam));
  }, [searchParams]);

  // ✅ refetch فوري لما اليوزر يرجع لصفحة المبيعات (من الطباعة مثلاً)
  useEffect(() => {
    refetch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { data: customers } = useApi<{ items: { id: string; name: string; phone: string | null; balance: number }[] }>(
    "/api/customers?limit=200"
  );
  const customerOptions: SearchOption[] = (customers?.items || []).map(c => ({
    id: c.id, name: c.name, sub: c.phone || undefined,
    extra: `مديون: ${formatEGP(c.balance)} ج`,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-gray-500">{data?.total ?? "..."} فاتورة</p>
        <Link href="/sales/new" className="btn-primary">+ فاتورة جديدة</Link>
      </div>

      <div className="card flex flex-col gap-3 md:flex-row md:flex-wrap">
        <div className="md:flex-1 md:min-w-[200px]">
          <SearchableSelect options={customerOptions} value={customerId} onChange={setCustomerId}
            placeholder="🔍 فلترة حسب العميل..." emptyLabel="كل العملاء" />
        </div>
        <select className="input-field text-sm md:w-40" value={type} onChange={e => setType(e.target.value)}>
          <option value="">كل الأنواع</option>
          <option value="عادية">عادية</option>
          <option value="ضريبية">ضريبية</option>
          <option value="عرض سعر">عرض سعر</option>
        </select>
        <select className="input-field text-sm md:w-40" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">كل الحالات</option>
          <option value="مكتملة">مكتملة</option>
          <option value="قيد التنفيذ">قيد التنفيذ</option>
          <option value="ملغاة">ملغاة</option>
        </select>
      </div>

      {loading ? <div className="card text-center py-12 text-gray-500">⏳ جاري التحميل...</div> : (
        <>
          {/* Mobile */}
          <div className="space-y-2 md:hidden">
            {data?.items.map(inv => (
              <div key={inv.id} className="card p-3">
                <div onClick={() => setOpenInvoice(inv.id)} className="cursor-pointer">
                  <div className="flex items-start justify-between mb-1.5">
                    <div className="font-mono font-bold text-nazlawy-600 text-lg">#{inv.invoice_number}</div>
                    <span className={`badge ${statusColor(inv.status)}`}>{inv.status}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                    <span>{formatDate(inv.invoice_date)}</span><span>{inv.invoice_type}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-sm truncate flex-1">{inv.customer?.name || "—"}</div>
                    <div className="font-bold text-nazlawy-600 text-base shrink-0 ml-2">{formatEGP(inv.total)} ج</div>
                  </div>
                </div>
                <div className="flex gap-2 mt-2 pt-2 border-t" onClick={e => e.stopPropagation()}>
                  <button onClick={() => window.open(`/print/invoice/${inv.id}?autoprint=1`, "_blank")} className="flex-1 text-xs px-2 py-1.5 rounded bg-nazlawy-50 text-nazlawy-700 hover:bg-nazlawy-100 border border-nazlawy-200 font-medium flex items-center justify-center gap-1">
                    <span>🖨️</span>
                    <span>طباعة</span>
                  </button>
                  {inv.customer && inv.status !== 'ملغاة' && (
                    <button onClick={() => setPaymentInvoice(inv)} className="flex-1 text-xs px-2 py-1.5 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-300 font-bold flex items-center justify-center gap-1">
                      <span>💳</span>
                      <span>تحصيل</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
            {data?.items.length === 0 && <div className="card text-center py-12 text-gray-400">لا توجد فواتير</div>}
          </div>

          {/* Desktop */}
          <div className="card overflow-x-auto p-0 hidden md:block">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-3 text-right">رقم</th><th className="p-3 text-right">التاريخ</th>
                  <th className="p-3 text-right">النوع</th><th className="p-3 text-right">العميل</th>
                  <th className="p-3 text-right">المخزن</th><th className="p-3 text-right">الأصناف</th>
                  <th className="p-3 text-right">الإجمالي</th><th className="p-3 text-right">الحالة</th>
                  <th className="p-3 text-right">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {data?.items.map(inv => (
                  <tr key={inv.id} onClick={() => setOpenInvoice(inv)} className="border-t hover:bg-nazlawy-50 cursor-pointer transition-colors">
                    <td className="p-3 font-mono font-bold">#{inv.invoice_number}</td>
                    <td className="p-3 text-xs">{formatDate(inv.invoice_date)}</td>
                    <td className="p-3 text-xs">{inv.invoice_type}</td>
                    <td className="p-3">{inv.customer?.name || "—"}</td>
                    <td className="p-3 text-xs">{inv.store?.name || "—"}</td>
                    <td className="p-3 text-center">{inv._count.items}</td>
                    <td className="p-3 font-bold text-nazlawy-600">{formatEGP(inv.total)}</td>
                    <td className="p-3"><span className={`badge ${statusColor(inv.status)}`}>{inv.status}</span></td>
                    <td className="p-3" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1.5 items-center">
                        <button onClick={() => window.open(`/print/invoice/${inv.id}?autoprint=1`, "_blank")} className="text-xs px-2.5 py-1 rounded bg-nazlawy-50 text-nazlawy-700 hover:bg-nazlawy-100 border border-nazlawy-200 font-medium flex items-center gap-1" title="طباعة الفاتورة">
                          <span>🖨️</span>
                          <span>طباعة</span>
                        </button>
                        {inv.customer && inv.status !== 'ملغاة' && (
                          <button onClick={() => setPaymentInvoice(inv)} className="text-xs px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-300 font-bold flex items-center gap-1 shadow-sm" title="تسجيل تحصيل لهذه الفاتورة">
                            <span>💳</span>
                            <span>تحصيل</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {data?.items.length === 0 && <tr><td colSpan={9} className="p-12 text-center text-gray-400">لا توجد فواتير</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {data && data.total > 0 && (
        <Pagination
          total={data.total}
          page={data.page}
          pageSize={data.limit}
          baseUrl="/sales"
        />
      )}

      {openInvoice && (
        <InvoiceDetailsModal
          invoice={typeof openInvoice === 'object' ? openInvoice : null}
          invoiceId={typeof openInvoice === 'object' ? openInvoice.id : openInvoice}
          isAdmin={isAdmin}
          onClose={() => setOpenInvoice(null)}
          onChanged={refetch}
        />
      )}

      {paymentInvoice && (
        <CustomerPaymentModal
          isOpen={!!paymentInvoice}
          onClose={() => setPaymentInvoice(null)}
          defaultCustomerId={paymentInvoice.customer_id || paymentInvoice.customer?.id}
          defaultCustomerName={paymentInvoice.customer?.name}
          defaultInvoiceId={paymentInvoice.id}
          onSuccess={() => {
            setPaymentInvoice(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB 2 — مرتجعات العملاء
// ═══════════════════════════════════════════════════════════
function CustomerReturnsTab({ isAdmin }: { isAdmin: boolean }) {
  const [customerId, setCustomerId] = useState("");
  const [openReturn, setOpenReturn] = useState<string | null>(null);

  const { data: customers } = useApi<{ items: { id: string; name: string; phone: string | null; balance: number }[] }>("/api/customers?limit=200");
  const qs = customerId ? `&customer_id=${customerId}` : "";
  const { data, loading, refetch } = useApi<{ items: CustomerReturn[]; total: number }>(`/api/returns/customer?limit=100${qs}`);
  const totalAmount = (data?.items || []).reduce((s, r) => s + Number(r.total_amount), 0);

  const customerOptions: SearchOption[] = (customers?.items || []).map(c => ({
    id: c.id, name: c.name, sub: c.phone || undefined,
    extra: `مديون: ${formatEGP(c.balance)} ج`,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-gray-500">{data?.total ?? "..."} مرتجع • إجمالي: {formatEGP(totalAmount)} ج</p>
        <Link href="/returns/customer/new" className="btn-primary bg-orange-500 hover:bg-orange-600">+ مرتجع جديد</Link>
      </div>

      <div className="card flex flex-col gap-3 md:flex-row md:flex-wrap">
        <div className="md:flex-1 md:min-w-[200px]">
          <SearchableSelect options={customerOptions} value={customerId} onChange={setCustomerId}
            placeholder="🔍 فلترة حسب العميل..." emptyLabel="كل العملاء" />
        </div>
      </div>

      {loading ? <div className="card text-center py-12 text-gray-500">⏳ جاري التحميل...</div> : (
        <>
          {/* Mobile */}
          <div className="space-y-2 md:hidden">
            {data?.items.map(ret => (
              <div key={ret.id} onClick={() => setOpenReturn(ret.id)}
                className="card p-3 cursor-pointer hover:border-orange-400 hover:shadow-md transition-all">
                <div className="flex items-start justify-between mb-1.5">
                  <div className="font-mono font-bold text-orange-600 text-lg">↩️ #{ret.return_number}</div>
                  <span className={`badge ${statusColor(ret.status)}`}>{ret.status}</span>
                </div>
                <div className="text-xs text-gray-500 mb-1.5">{formatDate(ret.return_date)}</div>
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-sm truncate flex-1">{ret.customer?.name || "—"}</div>
                  <div className="font-bold text-orange-600 text-base shrink-0 ml-2">{formatEGP(ret.total_amount)} ج</div>
                </div>
              </div>
            ))}
            {data?.items.length === 0 && <div className="card text-center py-12 text-gray-400">لا توجد مرتجعات</div>}
          </div>

          {/* Desktop */}
          <div className="card overflow-x-auto p-0 hidden md:block">
            <table className="w-full text-sm">
              <thead className="bg-orange-50">
                <tr>
                  <th className="p-3 text-right">رقم المرتجع</th><th className="p-3 text-right">التاريخ</th>
                  <th className="p-3 text-right">العميل</th><th className="p-3 text-right">الأصناف</th>
                  <th className="p-3 text-right">الإجمالي</th><th className="p-3 text-right">الحالة</th>
                  <th className="p-3 text-right">المنشئ</th>
                </tr>
              </thead>
              <tbody>
                {data?.items.map(ret => (
                  <tr key={ret.id} onClick={() => setOpenReturn(ret.id)}
                    className="border-t hover:bg-orange-50 cursor-pointer transition-colors">
                    <td className="p-3 font-mono font-bold text-orange-600">↩️ #{ret.return_number}</td>
                    <td className="p-3 text-xs">{formatDate(ret.return_date)}</td>
                    <td className="p-3 font-semibold">{ret.customer?.name || "—"}</td>
                    <td className="p-3 text-center">{ret._count.items}</td>
                    <td className="p-3 font-mono font-bold">{formatEGP(ret.total_amount)}</td>
                    <td className="p-3"><span className={`badge ${statusColor(ret.status)}`}>{ret.status}</span></td>
                    <td className="p-3 text-xs text-gray-500">{ret.creator?.full_name || "—"}</td>
                  </tr>
                ))}
                {data?.items.length === 0 && <tr><td colSpan={7} className="p-12 text-center text-gray-400">لا توجد مرتجعات عملاء</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {openReturn && (
        <CustomerReturnDetailsModal returnId={openReturn} isAdmin={isAdmin}
          onClose={() => setOpenReturn(null)} onChanged={refetch} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MODAL — تفاصيل مرتجع العميل
// ═══════════════════════════════════════════════════════════
function CustomerReturnDetailsModal({ returnId, isAdmin, onClose, onChanged }: {
  returnId: string; isAdmin: boolean; onClose: () => void; onChanged: () => void;
}) {
  const { data: ret, loading } = useApi<any>(`/api/returns/customer/${returnId}`);
  const { mutate } = useApiMutation();

  if (loading) return <ModalShell onClose={onClose}><p>⏳ جاري التحميل...</p></ModalShell>;
  if (!ret)    return <ModalShell onClose={onClose}><p>❌ لم يتم العثور على المرتجع</p></ModalShell>;

  const isCancelled = ret.status === "ملغاة";

  async function cancelReturn() {
    if (!confirm("هل تريد إلغاء هذا المرتجع؟\nسيتم خصم الكميات من المخزون وإعادة المبلغ لرصيد العميل.")) return;
    const { error } = await mutate("DELETE", `/api/returns/customer/${returnId}`);
    if (error) { alert("❌ " + error); return; }
    alert("✅ تم إلغاء المرتجع"); onClose(); onChanged();
  }
  async function deleteReturn() {
    if (!confirm("⚠️ حذف نهائي — لا يمكن التراجع عنه. هل أنت متأكد؟")) return;
    const { error } = await mutate("DELETE", `/api/returns/customer/${returnId}?permanent=true`);
    if (error) { alert("❌ " + error); return; }
    alert("✅ تم الحذف النهائي"); onClose(); onChanged();
  }

  return (
    <ModalShell onClose={onClose} wide>
      <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between z-10">
        <div>
          <h2 className="text-lg font-bold">↩️ مرتجع عميل #{ret.return_number}
            <span className={`badge ${statusColor(ret.status)} mr-2`}>{ret.status}</span>
          </h2>
          <p className="text-xs text-gray-500">{formatDate(ret.return_date)}</p>
        </div>
        <button onClick={onClose} className="text-2xl text-gray-400 hover:text-red-500">✕</button>
      </div>
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Info label="العميل" value={ret.customer?.name} />
          <Info label="المنشئ" value={ret.creator?.full_name} />
          {ret.notes && <Info label="ملاحظات" value={ret.notes} />}
        </div>
        <table className="w-full text-sm">
          <thead className="bg-orange-50">
            <tr>
              <th className="p-2 text-right">الصنف</th><th className="p-2 text-center">الكمية</th>
              <th className="p-2 text-left">سعر الوحدة</th><th className="p-2 text-left">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {(ret.items || []).map((it: any) => (
              <tr key={it.id} className="border-t">
                <td className="p-2">{it.product_name}</td>
                <td className="p-2 text-center font-mono">{Number(it.quantity)}</td>
                <td className="p-2 font-mono">{formatEGP(Number(it.unit_price))}</td>
                <td className="p-2 font-mono font-bold">{formatEGP(Number(it.line_total))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t pt-3 flex justify-between text-lg font-extrabold text-orange-700">
          <span>الإجمالي:</span><span className="font-mono">{formatEGP(Number(ret.total_amount))} ج</span>
        </div>
        <div className="flex flex-wrap gap-2 pt-3 border-t">
          {!isCancelled && (
            <button onClick={cancelReturn} className="text-sm px-4 py-2 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 border border-red-200">❌ إلغاء المرتجع</button>
          )}
          {isCancelled && <span className="text-sm text-red-700 font-bold self-center">🚫 ملغى</span>}
          {isAdmin && (
            <button onClick={deleteReturn} className="text-sm px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-black ml-auto">🗑️ حذف نهائي</button>
          )}
          <button onClick={onClose} className="btn-secondary text-sm">إغلاق</button>
        </div>
      </div>
    </ModalShell>
  );
}

// ═══════════════════════════════════════════════════════════
// MODAL — تفاصيل فاتورة المبيعات (full edit)
function InvoiceDetailsModal({ invoice, invoiceId, isAdmin, onClose, onChanged }: {
  invoice?: Invoice | null; invoiceId: string; isAdmin: boolean; onClose: () => void; onChanged: () => void;
}) {
  const { data: inv, loading, refetch } = useApi<any>(`/api/sales/invoices/${invoiceId}`);
  const { data: storesData } = useApi<{ items: { id: string; name: string }[] }>("/api/stores");
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const { data: searchProductsData, loading: searchingProducts } = useApi<{ items: { id: string; name: string; default_sale_price: number; total_stock: number }[] }>(
    showProductPicker ? `/api/products?search=${encodeURIComponent(productSearch)}&limit=100` : null
  );
  const { mutate, loading: saving } = useApiMutation();

  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [discount, setDiscount] = useState(0);
  const [paidAmount, setPaidAmount] = useState(0);
  const [status, setStatus] = useState("");
  const [invoiceType, setInvoiceType] = useState("");
  const [notes, setNotes] = useState("");
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (inv && !editing) {
      setItems(inv.items || []);
      setDiscount(Number(inv.discount || 0));
      setPaidAmount(Number(inv.paid_amount || 0));
      setStatus(inv.status);
      setInvoiceType(inv.invoice_type);
      setNotes(inv.notes || "");
    }
  }, [inv, editing]);

  const invData = inv || invoice;
  if (!invData) {
    return (
      <ModalShell onClose={onClose} wide>
        <div className="p-8 text-center space-y-3">
          <div className="w-8 h-8 border-4 border-nazlawy-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-bold text-gray-600">جاري فتح الفاتورة...</p>
        </div>
      </ModalShell>
    );
  }

  const isCompleted = invData.status === "مكتملة";
  const isCancelled = invData.status === "ملغاة";
  const isQuotation = invData.invoice_type === "عرض سعر";
  const subtotal = items.reduce((s: number, i: any) => s + Number(i.quantity) * Number(i.unit_price), 0);
  const total = Math.max(0, subtotal - discount);

  function addItem(p: any) {
    const store = storesData?.items.find(s => s.id === invData.store_id) || storesData?.items[0];
    setItems([...items, { product_id: p.id, product_name: p.name, quantity: 1, unit_price: Number(p.default_sale_price), store_id: invData.store_id || store?.id }]);
    setShowProductPicker(false); setProductSearch("");
  }
  function removeItem(idx: number) { setItems(items.filter((_: any, i: number) => i !== idx)); }
  function updateItem(idx: number, field: string, value: any) {
    setItems(items.map((it: any, i: number) => {
      if (i !== idx) return it;
      const next = { ...it, [field]: value };
      if (field === "quantity") { const q = Number(value); next.quantity = Number.isFinite(q) && q > 0 ? q : 0; }
      if (field === "unit_price") { const v = Number(value); next.unit_price = Number.isFinite(v) && v >= 0 ? v : 0; }
      return next;
    }));
  }

  async function saveChanges() {
    const validItems = items.filter((i: any) => Number(i.quantity) > 0 && Number(i.unit_price) >= 0);
    if (validItems.length === 0) { alert("❌ لازم صنف واحد على الأقل"); return; }
    const { error } = await mutate("PATCH", `/api/sales/invoices/${invoiceId}`, {
      items: validItems.map((i: any) => ({ product_id: i.product_id, store_id: i.store_id || invData.store_id, quantity: i.quantity, unit_price: i.unit_price })),
      discount,
      status: invoiceType === "عرض سعر" ? "قيد التنفيذ" : status,
      invoice_type: invoiceType,
      notes,
    });
    if (error) { alert("❌ " + error); return; }
    alert("✅ تم حفظ التعديلات"); setEditing(false); refetch(); onChanged();
  }
  function askCancelInvoice() {
    setShowCancelConfirm(true);
  }
  async function confirmCancelInvoice(keepPayments: boolean) {
    setCancelling(true);
    const url = keepPayments
      ? `/api/sales/invoices/${invoiceId}?keepPayments=true`
      : `/api/sales/invoices/${invoiceId}`;
    const { error } = await mutate("DELETE", url);
    setCancelling(false);
    setShowCancelConfirm(false);
    if (error) { alert("❌ " + error); return; }
    onClose(); onChanged();
  }
  function askDeleteInvoice() {
    setShowDeleteConfirm(true);
  }
  async function confirmDeleteInvoice(keepPayments: boolean) {
    setDeleting(true);
    const url = keepPayments
      ? `/api/sales/invoices/${invoiceId}?permanent=true&keepPayments=true`
      : `/api/sales/invoices/${invoiceId}?permanent=true`;
    const { error } = await mutate("DELETE", url);
    setDeleting(false);
    setShowDeleteConfirm(false);
    if (error) { alert("❌ " + error); return; }
    onClose(); onChanged();
  }

  const filteredProducts = searchProductsData?.items || [];
  const displayItems = items.length > 0 ? items : (invData.items || []);

  return (
    <ModalShell onClose={onClose} wide>
      <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between z-10">
        <div>
          <h2 className="text-lg font-bold">🛒 فاتورة مبيعات #{invData.invoice_number}
            <span className={`badge ${statusColor(invData.status)} mr-2`}>{invData.status}</span>
          </h2>
          <p className="text-xs text-gray-500">{formatDate(invData.invoice_date)} • {invData.invoice_type}</p>
        </div>
        <button onClick={onClose} className="text-2xl text-gray-400 hover:text-red-500">✕</button>
      </div>
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm items-center">
          <Info label="العميل" value={invData.customer?.name || "—"} />
          <Info label="المخزن" value={invData.store?.name || "—"} />
          <Info label="المنشئ" value={invData.creator?.full_name || "—"} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold">الأصناف ({displayItems.length})</h3>
            {editing && !isCompleted && !isCancelled && (
              <button onClick={() => setShowProductPicker(true)} className="text-xs btn-primary py-1 px-3">+ صنف</button>
            )}
          </div>
          {editing && !isCompleted && !isCancelled ? (
            <div className="space-y-2">
              {items.map((it: any, i: number) => (
                <div key={i} className="bg-gray-50 rounded p-2 text-sm flex items-center gap-2 flex-wrap">
                  <div className="font-semibold flex-1 min-w-[150px]">{it.product_name}</div>
                  <input type="number" min={0} step="any" value={it.quantity} onChange={e => updateItem(i, "quantity", parseFloat(e.target.value) || 0)} className="input-field text-xs p-1 w-20" placeholder="الكمية" />
                  <input type="number" min={0} step="any" value={it.unit_price === 0 ? '' : it.unit_price} onChange={e => updateItem(i, "unit_price", parseFloat(e.target.value) || 0)} className="input-field text-xs p-1 w-24" placeholder="السعر" />
                  <div className="text-xs font-bold w-24 text-left">{formatEGP(Number(it.quantity) * Number(it.unit_price))}</div>
                  <button onClick={() => removeItem(i)} className="text-red-500 text-xs">✕</button>
                </div>
              ))}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-2 text-right">الصنف</th><th className="p-2 text-center">الكمية</th>
                  <th className="p-2 text-left">السعر</th><th className="p-2 text-left">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {displayItems.map((it: any, idx: number) => (
                  <tr key={it.id || idx} className="border-t">
                    <td className="p-2">{it.product_name}</td>
                    <td className="p-2 text-center font-mono">{Number(it.quantity)}</td>
                    <td className="p-2 text-left font-mono">{formatEGP(Number(it.unit_price))}</td>
                    <td className="p-2 text-left font-mono font-bold">{formatEGP(Number(it.line_total || (Number(it.quantity) * Number(it.unit_price))))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {editing && !isCompleted && !isCancelled && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-gray-600 block mb-1">النوع</label>
              <select className="input-field text-sm" value={invoiceType} onChange={e => setInvoiceType(e.target.value)}>
                <option value="عادية">عادية</option><option value="ضريبية">ضريبية</option><option value="عرض سعر">عرض سعر</option>
              </select>
            </div>
            {invoiceType !== "عرض سعر" && (
              <div>
                <label className="text-xs text-gray-600 block mb-1">الحالة</label>
                <select className="input-field text-sm" value={status} onChange={e => setStatus(e.target.value)}>
                  <option value="قيد التنفيذ">قيد التنفيذ</option><option value="مكتملة">مكتملة</option>
                </select>
              </div>
            )}
            <div>
              <label className="text-xs text-gray-600 block mb-1">الخصم</label>
              <input type="number" min={0} step={0.01} className="input-field text-sm" value={discount === 0 ? '' : discount} onChange={e => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))} placeholder="0" />
            </div>
            <div className="md:col-span-3">
              <label className="text-xs text-gray-600 block mb-1">ملاحظات</label>
              <textarea className="input-field text-sm" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>
        )}

        <div className="border-t pt-3 space-y-1 text-sm bg-slate-50 p-3 rounded-xl border border-slate-200">
          <div className="flex justify-between text-gray-600"><span>الإجمالي قبل الخصم:</span><span className="font-mono font-bold">{formatEGP(Number(invData.subtotal))} ج</span></div>
          {Number(invData.discount) > 0 && <div className="flex justify-between text-yellow-700"><span>الخصم:</span><span className="font-mono font-bold">- {formatEGP(Number(invData.discount))} ج</span></div>}
          <div className="border-t pt-2 mt-1 space-y-1.5">
            {/* الترتيب المحاسبي الصحيح: حساب سابق ← الفاتورة ← المدفوع ← المتبقي */}
            {invData.customer && invData.customer_prev_balance !== null && invData.customer_prev_balance !== undefined && (
              <div className="flex justify-between text-xs text-gray-600">
                <span>الحساب السابق:</span>
                <span className={`font-mono font-bold ${Number(invData.customer_prev_balance) > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {formatEGP(Number(invData.customer_prev_balance))} ج
                </span>
              </div>
            )}
            <div className="flex justify-between text-sm font-extrabold text-slate-800">
              <span>+ الفاتورة الحالية:</span>
              <span className="font-mono">{formatEGP(Number(invData.total))} ج</span>
            </div>
            {Number(invData.paid_amount) > 0 && (
              <div className="flex justify-between text-emerald-700 font-bold bg-emerald-100/70 px-2 py-1 rounded-md text-xs">
                <span>- المبلغ المدفوع:</span>
                <span className="font-mono">{formatEGP(Number(invData.paid_amount))} ج</span>
              </div>
            )}
            {invData.customer && (
              <div className="flex justify-between text-sm font-extrabold border-t pt-1.5 mt-1">
                <span>= المتبقي على العميل:</span>
                <span className={`font-mono ${
                  (Number(invData.customer_prev_balance || 0) + Number(invData.total || 0) - Number(invData.paid_amount || 0)) > 0
                    ? 'text-red-600' : 'text-emerald-600'
                }`}>
                  {formatEGP(
                    Number(invData.customer_prev_balance || 0) +
                    Number(invData.total || 0) -
                    Number(invData.paid_amount || 0)
                  )} ج
                </span>
              </div>
            )}
          </div>
          {invData.notes && !editing && <div className="text-xs text-gray-600 pt-2 border-t">📝 {invData.notes}</div>}
        </div>

        <div className="flex flex-wrap gap-2 pt-3 border-t">
          <button onClick={() => window.open(`/print/invoice/${invoiceId}?autoprint=1`, "_blank")} className="btn-secondary text-sm">🖨️ طباعة</button>
          {invData.customer_id && (
            <button
              onClick={() => setShowPaymentModal(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold px-4 py-2 rounded-lg flex items-center gap-1 shadow-sm transition-colors"
            >
              <span>💳</span>
              <span>تسجيل تحصيل</span>
            </button>
          )}
          {!isCancelled && !isCompleted && (
            <>
              {!editing ? (
                <button onClick={() => setEditing(true)} className="btn-primary text-sm">✏️ تعديل</button>
              ) : (
                <>
                  <button onClick={saveChanges} disabled={saving} className="btn-primary text-sm">{saving ? "⏳ جاري الحفظ..." : "💾 حفظ"}</button>
                  <button onClick={() => { setEditing(false); setItems(invData.items || []); setDiscount(Number(invData.discount || 0)); setStatus(invData.status); setInvoiceType(invData.invoice_type); setNotes(invData.notes || ""); }} className="btn-secondary text-sm">إلغاء التعديل</button>
                </>
              )}
              <button onClick={askCancelInvoice} className="text-sm px-4 py-2 rounded-lg bg-red-50 text-red-700 hover:bg-red-100">❌ إلغاء الفاتورة</button>
            </>
          )}
          {isCompleted && !isQuotation && <button onClick={askCancelInvoice} className="text-sm px-4 py-2 rounded-lg bg-red-50 text-red-700 hover:bg-red-100">❌ إلغاء (إرجاع مخزون)</button>}
          {isCancelled && <span className="text-sm text-red-700 font-bold self-center">🚫 ملغاة</span>}
          {isAdmin && <button onClick={askDeleteInvoice} className="text-sm px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-black ml-auto">🗑️ حذف نهائي</button>}
          <button onClick={onClose} className="btn-secondary text-sm">إغلاق</button>
        </div>
      </div>

      {showPaymentModal && (
        <CustomerPaymentModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          defaultCustomerId={invData.customer_id}
          defaultCustomerName={invData.customer?.name}
          defaultInvoiceId={invData.id}
          onSuccess={() => {
            refetch();
            onChanged();
          }}
        />
      )}

      {/* مودال تأكيد الإلغاء مع تفاصيل المدفوعات */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
            <div className="text-center">
              <div className="text-5xl mb-2">⚠️</div>
              <h3 className="text-lg font-extrabold text-red-700">تأكيد إلغاء الفاتورة</h3>
              <p className="text-sm text-gray-500 mt-1">فاتورة #{invData.invoice_number} — إجمالي: {formatEGP(Number(invData.total))} ج</p>
            </div>

            {/* دائماً: إرجاع المخزون */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-700">
              <p className="font-bold mb-1">📦 سيتم دائماً: إرجاع مخزون {invData.items?.length || 0} صنف لمخازنهم</p>
            </div>

            {Number(invData.paid_amount) > 0 ? (
              /* فيه مدفوعات — اعرض خيارين */
              <div className="space-y-2">
                <p className="text-xs font-bold text-center text-gray-600">
                  يوجد دفع مرتبط بالفاتورة — اختر ماذا تريد:
                </p>

                {/* خيار 1: إلغاء فقط (الإبقاء على الدفع) */}
                <button
                  onClick={() => confirmCancelInvoice(true)}
                  disabled={cancelling}
                  className="w-full text-right bg-amber-50 border-2 border-amber-400 hover:bg-amber-100 rounded-xl p-3 transition-all disabled:opacity-60"
                >
                  <div className="font-extrabold text-amber-800 text-sm">💰 إلغاء الفاتورة فقط</div>
                  <div className="text-xs text-amber-700 mt-0.5">
                    المدفوع ({formatEGP(Number(invData.paid_amount))} ج) يفضل في الخزينة ويصبح رصيد دائن للعميل
                  </div>
                </button>

                {/* خيار 2: إلغاء + حذف الدفع */}
                <button
                  onClick={() => confirmCancelInvoice(false)}
                  disabled={cancelling}
                  className="w-full text-right bg-red-50 border-2 border-red-400 hover:bg-red-100 rounded-xl p-3 transition-all disabled:opacity-60"
                >
                  <div className="font-extrabold text-red-800 text-sm">🗑️ إلغاء الفاتورة + حذف الدفع</div>
                  <div className="text-xs text-red-700 mt-0.5">
                    خصم {formatEGP(Number(invData.paid_amount))} ج من الخزينة وإرجاع رصيد العميل كما كان
                  </div>
                </button>

                {cancelling && <p className="text-center text-xs text-gray-500">⏳ جاري الإلغاء...</p>}
              </div>
            ) : (
              /* مفيش مدفوعات — زر واحد */
              <>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 text-xs text-blue-700 text-center">
                  ℹ️ لا يوجد مبالغ مدفوعة مرتبطة بهذه الفاتورة
                </div>
                <button
                  onClick={() => confirmCancelInvoice(false)}
                  disabled={cancelling}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-extrabold py-2.5 rounded-xl text-sm transition-colors disabled:opacity-60"
                >
                  {cancelling ? "⏳ جاري الإلغاء..." : "✅ نعم، إلغاء الفاتورة"}
                </button>
              </>
            )}

            <button
              onClick={() => setShowCancelConfirm(false)}
              disabled={cancelling}
              className="w-full btn-secondary text-sm"
            >
              رجوع
            </button>
          </div>
        </div>
      )}

      {/* مودال تأكيد الحذف النهائي (أدمن فقط) */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4 border-2 border-gray-800">
            <div className="text-center">
              <div className="text-5xl mb-2">🗑️</div>
              <h3 className="text-lg font-extrabold text-gray-900">حذف نهائي — لا يمكن التراجع</h3>
              <p className="text-sm text-gray-500 mt-1">فاتورة #{invData.invoice_number} — إجمالي: {formatEGP(Number(invData.total))} ج</p>
            </div>

            <div className="bg-gray-900 text-white rounded-xl p-3 text-xs">
              <p className="font-bold mb-1">⚠️ سيتم حذف الفاتورة وبنودها من قاعدة البيانات نهائياً</p>
              <p className="text-gray-300">لا توجد طريقة للتراجع عن هذا الإجراء</p>
            </div>

            {Number(invData.paid_amount) > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-bold text-center text-gray-600">
                  يوجد دفع مرتبط بالفاتورة — اختر ماذا تريد:
                </p>

                {/* خيار 1: الإبقاء على الدفع */}
                <button
                  onClick={() => confirmDeleteInvoice(true)}
                  disabled={deleting}
                  className="w-full text-right bg-amber-50 border-2 border-amber-400 hover:bg-amber-100 rounded-xl p-3 transition-all disabled:opacity-60"
                >
                  <div className="font-extrabold text-amber-800 text-sm">💰 حذف الفاتورة + الإبقاء على الدفع</div>
                  <div className="text-xs text-amber-700 mt-0.5">
                    المدفوع ({formatEGP(Number(invData.paid_amount))} ج) يصبح رصيد دائن للعميل في الخزينة
                  </div>
                </button>

                {/* خيار 2: حذف كل شيء */}
                <button
                  onClick={() => confirmDeleteInvoice(false)}
                  disabled={deleting}
                  className="w-full text-right bg-red-50 border-2 border-red-400 hover:bg-red-100 rounded-xl p-3 transition-all disabled:opacity-60"
                >
                  <div className="font-extrabold text-red-800 text-sm">🗑️ حذف الفاتورة + حذف الدفع</div>
                  <div className="text-xs text-red-700 mt-0.5">
                    خصم {formatEGP(Number(invData.paid_amount))} ج من الخزينة وإرجاع رصيد العميل كما كان
                  </div>
                </button>

                {deleting && <p className="text-center text-xs text-gray-500">⏳ جاري الحذف...</p>}
              </div>
            ) : (
              <>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 text-xs text-blue-700 text-center">
                  ℹ️ لا يوجد مبالغ مدفوعة مرتبطة بهذه الفاتورة
                </div>
                <button
                  onClick={() => confirmDeleteInvoice(false)}
                  disabled={deleting}
                  className="w-full bg-gray-900 hover:bg-black text-white font-extrabold py-2.5 rounded-xl text-sm transition-colors disabled:opacity-60"
                >
                  {deleting ? "⏳ جاري الحذف..." : "🗑️ تأكيد الحذف النهائي"}
                </button>
              </>
            )}

            <button
              onClick={() => setShowDeleteConfirm(false)}
              disabled={deleting}
              className="w-full btn-secondary text-sm"
            >
              رجوع
            </button>
          </div>
        </div>
      )}

      {showProductPicker && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={() => setShowProductPicker(false)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="p-3 border-b">
              <input autoFocus value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="🔍 ابحث عن صنف..." className="input-field" />
            </div>
            <div className="overflow-y-auto flex-1">
              {searchingProducts ? (
                <div className="p-8 text-center text-gray-500 font-bold">⏳ جاري البحث...</div>
              ) : filteredProducts.length > 0 ? (
                filteredProducts.map((p: any) => (
                  <button key={p.id} onClick={() => addItem(p)} className="w-full text-right p-3 border-b hover:bg-gray-50 flex justify-between items-center transition-colors">
                    <div>
                      <div className="font-semibold text-sm text-gray-800">{p.name}</div>
                      <div className="text-xs text-gray-500">{formatEGP(p.default_sale_price)} ج</div>
                    </div>
                    <span className="text-xs font-bold text-nazlawy-600 bg-nazlawy-50 px-2 py-1 rounded">+ إضافة</span>
                  </button>
                ))
              ) : (
                <div className="p-8 text-center text-gray-400 font-semibold">
                  {productSearch.trim() ? `لا توجد نتائج لـ "${productSearch}"` : 'لا توجد أصناف'}
                </div>
              )}
            </div>
            <div className="p-3 border-t"><button onClick={() => setShowProductPicker(false)} className="btn-secondary w-full">إغلاق</button></div>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

// ─── Shared helpers ───────────────────────────────────────
function ModalShell({ onClose, wide, children }: { onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-2 md:p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? "max-w-3xl" : "max-w-md"} max-h-[90vh] overflow-y-auto`}>
        {children}
      </div>
    </div>
  );
}
function Info({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="font-semibold">{value || "—"}</div>
    </div>
  );
}
