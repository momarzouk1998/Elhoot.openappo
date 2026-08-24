// =============================================
// ELNAZLAWY — Database Seed
// Run: npm run db:seed
// Creates: admin user, 4 stores, 4 treasuries, sample data
// =============================================
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding ELNAZLAWY database...');

  // Ensure schema exists
  await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS elnazlawy;`);

  // Clean business data while preserving existing users
  console.log('🧹 Cleaning business data while preserving users...');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE elnazlawy.audit_log, elnazlawy.treasury_transactions, elnazlawy.customer_payments, elnazlawy.supplier_payments, elnazlawy.checks, elnazlawy.expenses, elnazlawy.sales_invoice_items, elhoot.sales_invoices, elnazlawy.purchase_invoice_items, elhoot.purchase_invoices, elnazlawy.stock_transfers, elnazlawy.product_price_history, elhoot.inventory, elhoot.products, elhoot.customers, elhoot.suppliers, elhoot.stores, elnazlawy.treasuries RESTART IDENTITY CASCADE;`);

  const pwd = await bcrypt.hash('123456', 10);

  // === Users (من MIGRATION_PLAN.md - 2.4) ===
  console.log('👥 Ensuring default users exist...');
  const userDefinitions = [
    { username: 'openapps',    full_name: 'OPEN APPS',       phone: '01558282760', role: 'admin',      can_see_cost: true },
    { username: 'mahmoud',     full_name: 'حاج/ محمود حسين', phone: '01006172668', role: 'manager',    can_see_cost: true },
    { username: 'abumahmoud',  full_name: 'أبو محمود',       phone: '01129093469', role: 'manager',    can_see_cost: true },
    { username: 'ibram',       full_name: 'إبرام يوسف',      phone: '01095463383', role: 'accountant', can_see_cost: false },
    { username: 'rep1',        full_name: 'مندوب 1',         phone: '01000000001', role: 'rep',        can_see_cost: false },
    { username: 'rep2',        full_name: 'مندوب 2',         phone: '01000000002', role: 'rep',        can_see_cost: false },
  ];

  const users = await Promise.all(
    userDefinitions.map(async (user) => {
      return prisma.users.upsert({
        where: { username: user.username },
        update: {
          full_name: user.full_name,
          phone: user.phone,
          password_hash: pwd,
          role: user.role,
          can_see_cost: user.can_see_cost,
          is_active: true,
        },
        create: {
          username: user.username,
          full_name: user.full_name,
          phone: user.phone,
          password_hash: pwd,
          role: user.role,
          can_see_cost: user.can_see_cost,
          is_active: true,
        },
      });
    })
  );

  const [openapps, mahmoud, abumahmoud] = users;

  // === Stores (من MIGRATION_PLAN.md - 2.5) ===
  console.log('🏢 Creating stores...');
  const stores = await Promise.all([
    prisma.stores.create({ data: { id: '11111111-1111-1111-1111-111111111111', name: 'المحل',             type: 'showroom', description: 'معرض النزلاوى' } }),
    prisma.stores.create({ data: { id: '22222222-2222-2222-2222-222222222222', name: 'مخزن اللوحات',      type: 'store',    description: 'لوحات كهربائية وصاج' } }),
    prisma.stores.create({ data: { id: '33333333-3333-3333-3333-333333333333', name: 'مخزن اللمبات',      type: 'store',    description: 'رفايع، مفاتيح، لمبات، باريز، سدد' } }),
    prisma.stores.create({ data: { id: '44444444-4444-4444-4444-444444444444', name: 'مخزن الخراطيم',     type: 'store',    description: 'خراطيم، بواطات، سوستة' } }),
    prisma.stores.create({ data: { id: '55555555-5555-5555-5555-555555555555', name: 'عربية كبيرة',       type: 'vehicle',  description: 'توزيع جملة', assigned_user_id: mahmoud.id } }),
    prisma.stores.create({ data: { id: '66666666-6666-6666-6666-666666666666', name: 'عربية صغيرة',       type: 'vehicle',  description: 'أوردرات',   assigned_user_id: abumahmoud.id } }),
  ]);

  // === Treasuries (من MIGRATION_PLAN.md - 2.6 + Treasury recommendations) ===
  console.log('🏦 Creating treasuries...');
  await Promise.all([
    prisma.treasuries.create({ data: { name: 'الخزينة الرئيسية',     type: 'رئيسية',   opening_balance: 132125, current_balance: 132125, assigned_user_id: mahmoud.id } }),
    prisma.treasuries.create({ data: { name: 'عهدة عربية كبيرة',     type: 'عهدة عربية', opening_balance: 0, current_balance: 0, assigned_user_id: mahmoud.id } }),
    prisma.treasuries.create({ data: { name: 'عهدة عربية صغيرة',     type: 'عهدة عربية', opening_balance: 0, current_balance: 0, assigned_user_id: abumahmoud.id } }),
    prisma.treasuries.create({ data: { name: 'خزينة الإدارة',         type: 'إدارة',     opening_balance: 0, current_balance: 0 } }),
  ]);

  // === Sample Customers (17 من الـ plan) ===
  console.log('👥 Creating customers...');
  const customers = await Promise.all([
    prisma.customers.create({ data: { name: 'أحمد محمد علي',  phone: '01001234567', opening_balance: 5500,  balance: 5500,  route_days: ['السبت','الأربعاء'] } }),
    prisma.customers.create({ data: { name: 'محمود عبد الله', phone: '01002345678', opening_balance: 12000, balance: 12000, route_days: ['الأحد','الخميس'] } }),
    prisma.customers.create({ data: { name: 'علي حسن',         phone: '01003456789', opening_balance: 0,     balance: 0,     route_days: ['الإثنين'] } }),
    prisma.customers.create({ data: { name: 'كريم سعيد',       phone: '01004567890', opening_balance: 3200,  balance: 3200,  route_days: ['الثلاثاء'] } }),
    prisma.customers.create({ data: { name: 'يوسف إبراهيم',    phone: '01005678901', opening_balance: 800,   balance: 800,   route_days: ['السبت'] } }),
  ]);

  // === Sample Suppliers (10 من الـ plan) ===
  console.log('🏭 Creating suppliers...');
  await Promise.all([
    prisma.suppliers.create({ data: { name: 'السويدي للأجهزة',    phone: '01011111111', opening_balance: 15000, balance: 15000 } }),
    prisma.suppliers.create({ data: { name: 'اللمبات المصرية',     phone: '01022222222', opening_balance: 8000,  balance: 8000  } }),
    prisma.suppliers.create({ data: { name: 'الفيوم للكهرباء',     phone: '01033333333', opening_balance: 0,     balance: 0     } }),
    prisma.suppliers.create({ data: { name: 'النور للأجهزة',        phone: '01044444444', opening_balance: 4500,  balance: 4500  } }),
  ]);

  // === Sample Products (عينة من الـ 2160 منتج) ===
  console.log('🏷️ Creating sample products...');
  const sampleProducts = [
    { name: 'كشاف ليد 100 وات',                    category: 'كشافات',    unit: 'piece',  units_per_carton: 12, default_sale_price: 250,  last_purchase_price: 180 },
    { name: 'كشاف ليد 200 وات',                    category: 'كشافات',    unit: 'piece',  units_per_carton: 6,  default_sale_price: 480,  last_purchase_price: 350 },
    { name: 'لمبة ليد 12 وات E27',                 category: 'لمبات',     unit: 'piece',  units_per_carton: 50, default_sale_price: 35,   last_purchase_price: 22  },
    { name: 'لمبة ليد 18 وات E27',                 category: 'لمبات',     unit: 'piece',  units_per_carton: 50, default_sale_price: 55,   last_purchase_price: 35  },
    { name: 'بريزة 16 أمبير',                       category: 'باريز',     unit: 'piece',  units_per_carton: 24, default_sale_price: 45,   last_purchase_price: 28  },
    { name: 'مفتاح مفرد فينوس',                    category: 'مفاتيح',    unit: 'piece',  units_per_carton: 50, default_sale_price: 25,   last_purchase_price: 15  },
    { name: 'مفتاح مزدوج فينوس',                   category: 'مفاتيح',    unit: 'piece',  units_per_carton: 50, default_sale_price: 38,   last_purchase_price: 22  },
    { name: 'ترنز 400 وات ليد',                    category: 'ترنز',      unit: 'piece',  units_per_carton: 4,  default_sale_price: 850,  last_purchase_price: 620 },
    { name: 'ترنز 300 وات ليد',                    category: 'ترنز',      unit: 'piece',  units_per_carton: 4,  default_sale_price: 680,  last_purchase_price: 480 },
    { name: 'سلك 2.5 ملم مصري',                    category: 'أسلاك',     unit: 'piece',  units_per_carton: 1,  default_sale_price: 1850, last_purchase_price: 1450 },
    { name: 'خرطوم كهرباء 1.5 ملم',                category: 'خراطيم',    unit: 'piece',  units_per_carton: 1,  default_sale_price: 2200, last_purchase_price: 1750 },
    { name: 'شاسيه اسبوط ثنائي فضي',              category: 'شاسيهات',   unit: 'piece',  units_per_carton: 24, default_sale_price: 28,   last_purchase_price: 18  },
    { name: 'وش بلشاسيه ابيض كون نايس',           category: 'شاسيهات',   unit: 'piece',  units_per_carton: 100, default_sale_price: 8,    last_purchase_price: 4   },
    { name: 'دواية حديد 1.5',                       category: 'دوايات',    unit: 'piece',  units_per_carton: 12, default_sale_price: 85,   last_purchase_price: 55  },
    { name: 'بلوفنيرا 36 وات خارج وررم السويدي',  category: 'بلوفنيرا',  unit: 'piece',  units_per_carton: 8,  default_sale_price: 320,  last_purchase_price: 220 },
  ];
  const products = [];
  for (const p of sampleProducts) {
    const created = await prisma.products.create({ data: p });
    products.push(created);
  }

  // === Inventory (عينة لـ 3 مخازن) ===
  console.log('📦 Creating inventory...');
  for (const product of products) {
    for (const store of stores.slice(0, 4)) {
      const stock = Math.floor(Math.random() * 50) + 5;
      await prisma.inventory.create({
        data: { product_id: product.id, store_id: store.id, current_stock: stock, opening_balance: stock },
      });
    }
  }

  console.log('✅ Seed complete!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Database: elnazlawy schema created');
  console.log('👤 Admin login: username=openapps, password=123456');
  console.log('🏪 6 stores | 🏦 4 treasuries | 🏷️ 15 sample products');
  console.log('👥 5 sample customers | 🏭 4 sample suppliers');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main()
  .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
