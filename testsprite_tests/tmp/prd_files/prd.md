# ELNAZLAWY — نظام معرض الأثاث (النزلاوي)

## 1. نظرة عامة
نظام محاسبي متكامل لإدارة معرض أثاث، يشمل: المبيعات، المشتريات، المخزون، الخزائن، العملاء، الموردين، المصروفات، الشيكات، والتقارير. مكتوب بـ Next.js 15 (App Router) + TypeScript + Prisma + PostgreSQL، وواجهته عربية RTL.

## 2. المستخدمون والأدوار
- **admin**: صلاحية كاملة على كل الوحدات بما فيها إدارة المستخدمين
- **manager**: كل الوحدات عدا إدارة المستخدمين، يرى التكاليف
- **accountant**: كل الوحدات عدا إدارة المستخدمين
- **rep (مندوب)**: يرى فقط المبيعات + الأصناف + العملاء (وحداته الخاصة)

المصادقة عبر JWT cookie (مكتبة jose) + bcryptjs للباسورد. كل الـ APIs تتطلب auth ما عدا `/api/auth/login` و `/api/health`.

## 3. الوحدات الوظيفية

### 3.1 لوحة التحكم (Dashboard)
- KPIs: مبيعات اليوم/الشهر، صافي ربح الشهر (للمخولين فقط)، فواتير مفتوحة
- ديون العملاء والموردين، شيكات معلقة، قيمة المخزون
- تنبيهات الأصناف تحت الحد الأدنى

### 3.2 فواتير المبيعات (Sales Invoices)
- إنشاء فاتورة مع عناصر متعددة (كمية، سعر، خصم)
- أنواع: عادية | ضريبية | عرض سعر
- حالات: قيد التنفيذ | مكتملة | ملغاة
- عند الإتمام: خصم مخزون تلقائي + تحديث رصيد العميل + حساب صافي الربح من آخر سعر شراء
- منع البيع لو المخزون غير كافٍ

### 3.3 فواتير المشتريات (Purchase Invoices)
- إنشاء فاتورة شراء مع عناصر
- تحديث `last_purchase_price` للصنف تلقائياً
- تحديث رصيد المورد

### 3.4 العملاء (Customers)
- CRUD كامل + رصيد افتتاحي (موجب=مدين، سالب=دائن)
- `route_days`: أيام خط السير الأسبوعية
- صفحة تفاصيل: كشف حساب + فواتير + مدفوعات
- منع الحذف لو في فواتير أو مدفوعات (hard delete فقط)

### 3.5 الموردين (Suppliers)
- CRUD + رصيد افتتاحي
- مدفوعات + شيكات صادرة

### 3.6 الأصناف (Products)
- CRUD + barcode + category
- `units_per_carton` (قطع/كرتونة)
- `last_purchase_price` و `default_sale_price`
- `reorder_level` (حد إعادة الطلب)
- إخفاء التكلفة لغير المخولين (canSeeCost)

### 3.7 المخزون (Inventory)
- مخزون لكل صنف في كل مخزن (unique: product_id + store_id)
- فلتر low stock
- تحويلات بين المخازن (stock_transfers)
- صفحات my-inventory للمناديب

### 3.8 الخزائن (Treasury)
- خزائن متعددة: رئيسية | عهدة عربية | إدارة
- حركات الخزينة: in | out | transfer_out | transfer_in
- ربط مع كل المدفوعات والمصروفات والشيكات
- تحويلات بين الخزائن

### 3.9 المدفوعات (Payments)
- تحصيلات من العملاء: transaction (تحديث رصيد العميل + الخزينة + الفاتورة + سجل حركة)
- مدفوعات للموردين: transaction مماثل
- rate limiting (10 طلبات/5 دقائق لكل مستخدم)
- تعديل/حذف المدفوعات يحسب الفرق ويعكس الحركات

### 3.10 الشيكات (Checks)
- واردة (من عملاء) | صادرة (لموردين)
- حالات: تحت التحصيل | تم الصرف | مرفوض | مُلغى
- ربط بفواتير/مدفوعات

### 3.11 المصروفات (Expenses)
- مصروفات بتصنيفات (إيجار | كهرباء | مرتبات | عمولة مندوب | سلف | أخرى)
- خصم من الخزينة

### 3.12 التقارير (Reports)
- profit-loss (أرباح وخسائر)
- statements (كشوف حساب)
- date filter (من/إلى)

### 3.13 سجل التدقيق (Audit Log)
- تسجيل عمليات الحذف الحساسة (مدفوعات العملاء)

## 4. الصفحات
- `/login` — تسجيل الدخول
- `/dashboard` — الرئيسية
- `/customers`, `/customers/[id]`
- `/suppliers`, `/suppliers/[id]`
- `/products`
- `/sales`, `/sales/new`
- `/purchases`, `/purchases/new`
- `/inventory`, `/inventory/transfers`
- `/treasury`, `/treasury/customer-payments`, `/treasury/supplier-payments`
- `/expenses`
- `/reports`, `/reports/profit-loss`, `/reports/statements`
- `/collections`, `/route`
- `/my-inventory`, `/my-sales`
- `/profile`
- `/admin/users`, `/admin/routes`, `/admin/stores`
- `/print/invoice/[id]`

## 5. الـ API
كل الـ endpoints تحت `/api/*`، ترجع `{ ok: boolean, data?: ..., error?: { code, message } }`.

## 6. ملاحظات تقنية
- Prisma multiSchema (schema: elnazlawy)
- حقول Decimal كـ Decimal(15,2)
- RTL Arabic UI (Tailwind)
- لا يوجد caching layer خارجي (session cache في useApi hook فقط)
- Prisma client singleton على globalThis لتفادي reconnect في dev
