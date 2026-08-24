const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== البحث عن العميل مصطفى ===');

  const customers = await prisma.customers.findMany({
    where: {
      name: { contains: 'مصطفى', mode: 'insensitive' }
    }
  });

  console.log(`عدد العملاء العاثر عليهم باسم "مصطفى": ${customers.length}`);
  for (const c of customers) {
    console.log(`• ID: ${c.id} | Name: "${c.name}" | Active: ${c.is_active} | Phone: ${c.phone || 'بدون'}`);
  }

  const allCount = await prisma.customers.count();
  const activeCount = await prisma.customers.count({ where: { is_active: true } });
  console.log(`\nإجمالي عدد العملاء بالنظام: ${allCount} (النشطين: ${activeCount})`);
}

main().finally(() => prisma.$disconnect());
