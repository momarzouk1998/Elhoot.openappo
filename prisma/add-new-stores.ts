import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

const storeTypeMapping: Record<string, string> = {
  'محل': 'showroom',
  'مخزن': 'store', 
  'سيارة توزيع': 'vehicle'
};

async function addNewStores() {
  console.log('🏢 إضافة المخازن والفروع الجديدة...');
  
  try {
    // قراءة ملف CSV
    const csvContent = readFileSync(join(process.cwd(), 'data/Stores_New.csv'), 'utf-8');
    const lines = csvContent.split('\n').filter(line => line.trim());
    
    // إزالة header
    lines.shift();
    
    const stores = lines.map(line => {
      const [storeId, storeName, type, description, assignedRep] = line.split(',').map(s => s.trim());
      
      return {
        id: storeId || undefined,
        name: storeName,
        type: storeTypeMapping[type] || 'store',
        description: description || null,
        assigned_user_id: assignedRep ? parseInt(assignedRep) : null,
        is_active: true
      };
    });
    
    console.log(`📋 سيتم إضافة ${stores.length} مخزن/فرع`);
    
    // إضافة المخازن
    let addedCount = 0;
    let existingCount = 0;
    
    for (const store of stores) {
      try {
        // التحقق من وجود المخزن
        const existing = await prisma.stores.findUnique({
          where: { id: store.id }
        });
        
        if (existing) {
          console.log(`⚠️  المخزن موجود بالفعل: ${store.name}`);
          existingCount++;
          continue;
        }
        
        const newStore = await prisma.stores.create({
          data: store
        });
        
        console.log(`✅ تم إضافة: ${newStore.name} (${newStore.type})`);
        addedCount++;
        
      } catch (error: any) {
        console.error(`❌ فشل إضافة ${store.name}:`, error.message);
      }
    }
    
    console.log(`\n📊 النتائج:`);
    console.log(`✅ تم إضافة: ${addedCount} مخزن`);
    console.log(`⚠️  موجود بالفعل: ${existingCount} مخزن`);
    
    // عرض كل المخازن
    console.log(`\n🏢 كل المخازن والفروع الحالية:`);
    const allStores = await prisma.stores.findMany({
      orderBy: { name: 'asc' }
    });
    
    allStores.forEach((store, index) => {
      const typeEmoji = store.type === 'showroom' ? '🏪' : store.type === 'vehicle' ? '🚛' : '📦';
      console.log(`${index + 1}. ${typeEmoji} ${store.name} (${store.type})`);
    });
    
  } catch (error) {
    console.error('❌ خطأ في إضافة المخازن:', error);
  } finally {
    await prisma.$disconnect();
  }
}

addNewStores();