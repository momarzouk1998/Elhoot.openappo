const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== 1. فحص إحصائيات جميع المخازن في قاعدة البيانات المباشرة ===');

  const stores = await prisma.stores.findMany({
    orderBy: { name: 'asc' }
  });

  const inventory = await prisma.inventory.findMany({
    include: {
      product: true,
      store: true
    }
  });

  console.log(`إجمالي عدد المخازن: ${stores.length}`);
  console.log(`إجمالي سطر مخزون بالداتابيز: ${inventory.length}\n`);

  for (const store of stores) {
    const items = inventory.filter(i => i.store_id === store.id);
    const totalQty = items.reduce((sum, i) => sum + Number(i.current_stock || 0), 0);
    const totalValue = items.reduce((sum, i) => {
      const qty = Number(i.current_stock || 0);
      const price = Number(i.product?.last_purchase_price || 0);
      return sum + (qty > 0 ? qty * price : 0);
    }, 0);
    const positiveItems = items.filter(i => Number(i.current_stock || 0) > 0);

    console.log(`🏢 [${store.name}] (نوع: ${store.type}, نشط: ${store.is_active})`);
    console.log(`   • عدد الأصناف المسجلة (الكل): ${items.length}`);
    console.log(`   • عدد الأصناف التي برصيد > 0: ${positiveItems.length}`);
    console.log(`   • إجمالي القطع: ${totalQty.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    console.log(`   • إجمالي التكلفة: ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج`);
    console.log('----------------------------------------------------');
  }

  // البحث عن المخزنين
  const vehicleStore = stores.find(s => s.name.includes('عربية كبيرة') || s.name.includes('العربية الكبيرة'));
  const mainStore = stores.find(s => s.name.includes('المخزن الرئيسي') || s.name.includes('رئيسي'));

  if (!vehicleStore) {
    console.error('❌ لم يتم العثور على مخزن "عربية كبيرة"');
    return;
  }
  if (!mainStore) {
    console.error('❌ لم يتم العثور على مخزن "المخزن الرئيسي"');
    return;
  }

  console.log(`\n=== 2. بدء عملية نقل جميع الأصناف والكميات من [${vehicleStore.name}] إلى [${mainStore.name}] ===`);

  const vehicleItems = inventory.filter(i => i.store_id === vehicleStore.id && Number(i.current_stock) > 0);
  console.log(`عدد الأصناف التي تحتوي على رصيد للتحويل: ${vehicleItems.length}`);

  let transferredCount = 0;
  let totalQtyTransferred = 0;

  for (const vItem of vehicleItems) {
    const qtyToTransfer = Number(vItem.current_stock);
    if (qtyToTransfer <= 0) continue;

    await prisma.$transaction(async (tx) => {
      // 1. خصم من مخزن العربية الكبيرة
      await tx.inventory.update({
        where: { id: vItem.id },
        data: { current_stock: 0 }
      });

      // 2. إضافة إلى المخزن الرئيسي (upsert)
      const mainInv = await tx.inventory.upsert({
        where: {
          product_id_store_id: {
            product_id: vItem.product_id,
            store_id: mainStore.id
          }
        },
        update: {
          current_stock: { increment: qtyToTransfer }
        },
        create: {
          product_id: vItem.product_id,
          store_id: mainStore.id,
          current_stock: qtyToTransfer,
          reorder_level: vItem.reorder_level || 5
        }
      });

      // 3. تسجيل حركة تحويل مخزني
      await tx.stock_transfers.create({
        data: {
          from_store_id: vehicleStore.id,
          to_store_id: mainStore.id,
          product_id: vItem.product_id,
          product_name: vItem.product?.name || '',
          quantity: qtyToTransfer,
          status: 'مكتملة',
          notes: 'تحويل كامل تلقائي بناءً على طلب الإدارة'
        }
      });
    });

    transferredCount++;
    totalQtyTransferred += qtyToTransfer;
  }

  console.log(`\n✅ اكتملت عملية النقل بنجاح!`);
  console.log(`• الأصناف المنقولة: ${transferredCount}`);
  console.log(`• إجمالي القطع المنقولة: ${totalQtyTransferred.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);

  console.log('\n=== 3. الإحصائيات الجديدة للمخازن بعد النقل ===');
  const newInventory = await prisma.inventory.findMany({
    include: { product: true, store: true }
  });

  for (const store of [vehicleStore, mainStore]) {
    const items = newInventory.filter(i => i.store_id === store.id);
    const totalQty = items.reduce((sum, i) => sum + Number(i.current_stock || 0), 0);
    const totalValue = items.reduce((sum, i) => {
      const qty = Number(i.current_stock || 0);
      const price = Number(i.product?.last_purchase_price || 0);
      return sum + (qty > 0 ? qty * price : 0);
    }, 0);

    console.log(`🏢 [${store.name}]`);
    console.log(`   • عدد الأصناف المسجلة: ${items.length}`);
    console.log(`   • إجمالي القطع: ${totalQty.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    console.log(`   • إجمالي التكلفة: ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج`);
  }
}

main()
  .catch(e => {
    console.error('❌ حدث خطأ:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
