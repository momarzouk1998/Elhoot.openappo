import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma-direct';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const mainStore = await prisma.stores.findFirst({ where: { name: { contains: 'رئيسي' } } });
    const vehicleStore = await prisma.stores.findFirst({ where: { name: { contains: 'عربية كبيرة' } } });

    if (!mainStore || !vehicleStore) {
      return NextResponse.json({ ok: false, error: 'Stores not found' });
    }

    // 1. استعلام دقيق لرصيد المخزن الرئيسي حالياً
    const mainItems = await prisma.inventory.findMany({
      where: { store_id: mainStore.id, current_stock: { gt: 0 } },
      include: { product: true }
    });

    // 2. استعلام حركات التحويل المسجلة باسم عربية كبيرة -> المخزن الرئيسي
    const transfers = await prisma.stock_transfers.findMany({
      where: { from_store_id: vehicleStore.id, to_store_id: mainStore.id }
    });

    const totalTransferredQty = transfers.reduce((sum, t) => sum + Number(t.quantity), 0);

    // 3. فحص كم صنف من الـ 72 صنف المكررين كان موجوداً أصلاً في المخزن الرئيسي قبل التحويل
    const transferredProductIds = transfers.map(t => t.product_id);
    const existingInMainBefore = await prisma.inventory.findMany({
      where: {
        store_id: mainStore.id,
        product_id: { in: transferredProductIds },
      }
    });

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      main_store_current: {
        store_name: mainStore.name,
        total_items_with_stock_gt_0: mainItems.length,
        total_quantity_pieces: mainItems.reduce((sum, i) => sum + Number(i.current_stock), 0),
        total_cost_value_egp: mainItems.reduce((sum, i) => sum + (Number(i.current_stock) * Number(i.product?.last_purchase_price || 0)), 0),
      },
      audit_transfer_from_vehicle: {
        vehicle_store_name: vehicleStore.name,
        recorded_transfers_count: transfers.length,
        total_transferred_quantity_pieces: totalTransferredQty,
        matching_products_already_in_main_before: existingInMainBefore.length,
      }
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
