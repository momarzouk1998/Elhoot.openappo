import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth-server';

/**
 * POST /api/inventory/adjust
 * تعديل كمية المخزون (جرد - تسوية)
 * 
 * Body: {
 *   inventory_id: string,
 *   new_quantity: number,
 *   adjustment_type?: string,  // جرد | تسوية | فاقد | تصحيح
 *   reason?: string,
 *   notes?: string
 * }
 */
export async function POST(request: NextRequest) {
  const profile = await getCurrentUser();
  if (!profile) {
    return NextResponse.json(
      { ok: false, error: { code: 'UNAUTHORIZED', message: 'غير مسجل' } },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { inventory_id, new_quantity, adjustment_type, reason, notes } = body;

    // === Validation ===
    if (!inventory_id) {
      return NextResponse.json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'معرف المخزون مطلوب' } },
        { status: 400 }
      );
    }

    const newQty = Number(new_quantity);
    if (!Number.isFinite(newQty) || newQty < 0) {
      return NextResponse.json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'الكمية الجديدة غير صالحة' } },
        { status: 400 }
      );
    }

    // جلب بيانات المخزون الحالية
    const inventory = await prisma.inventory.findUnique({
      where: { id: inventory_id },
      include: {
        product: { 
          select: { 
            id: true, 
            name: true, 
            last_purchase_price: true 
          } 
        },
        store: { 
          select: { 
            id: true, 
            name: true 
          } 
        }
      }
    });

    if (!inventory) {
      return NextResponse.json(
        { ok: false, error: { code: 'NOT_FOUND', message: 'المخزون غير موجود' } },
        { status: 404 }
      );
    }

    const oldQty = Number(inventory.current_stock);
    const difference = newQty - oldQty;

    // إذا لم يتغير شيء
    if (difference === 0) {
      return NextResponse.json(
        { ok: false, error: { code: 'NO_CHANGE', message: 'الكمية لم تتغير' } },
        { status: 400 }
      );
    }

    // حساب التأثير المالي
    const unitCost = Number(inventory.product.last_purchase_price) || 0;
    const financialImpact = difference * unitCost;

    // تحديد نوع التعديل تلقائياً إذا لم يُحدد
    let adjType = adjustment_type || 'جرد';
    if (!adjustment_type) {
      if (difference > 0) {
        adjType = 'تسوية'; // زيادة
      } else {
        adjType = 'فاقد'; // نقص
      }
    }

    // تحديث المخزون
    await prisma.inventory.update({
      where: { id: inventory_id },
      data: {
        current_stock: newQty,
        updated_at: new Date()
      }
    });

    // تسجيل التعديل
    const adjustment = await prisma.inventory_adjustments.create({
      data: {
        inventory_id: inventory_id,
        product_id: inventory.product.id,
        product_name: inventory.product.name,
        store_id: inventory.store.id,
        store_name: inventory.store.name,
        old_quantity: oldQty,
        new_quantity: newQty,
        difference: difference,
        adjustment_type: adjType,
        unit_cost: unitCost,
        financial_impact: financialImpact,
        reason: reason || null,
        notes: notes || null,
        adjusted_by: profile.id,
        adjustment_date: new Date()
      }
    });

    return NextResponse.json({
      ok: true,
      data: {
        inventory_id,
        product_name: inventory.product.name,
        store_name: inventory.store.name,
        old_quantity: oldQty,
        new_quantity: newQty,
        difference,
        adjustment_type: adjType,
        financial_impact: financialImpact,
        adjustment_id: adjustment.id
      },
      message: difference > 0 
        ? `✅ تم زيادة الكمية بمقدار ${difference}` 
        : `✅ تم تخفيض الكمية بمقدار ${Math.abs(difference)}`
    });

  } catch (e: any) {
    console.error('Inventory adjustment error:', e);
    return NextResponse.json(
      { ok: false, error: { code: 'SERVER_ERROR', message: e?.message || 'خطأ في الخادم' } },
      { status: 500 }
    );
  }
}
