import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth-server';

/**
 * POST /api/inventory/bulk-add
 * إضافة أصناف متعددة مع كمياتها في المخزون دفعة واحدة
 * 
 * Body: {
 *   store_id: string,
 *   items: Array<{
 *     product_name: string,
 *     category?: string,
 *     unit?: string,
 *     units_per_carton?: number,
 *     default_sale_price: number,
 *     last_purchase_price: number,
 *     quantity: number,  // الكمية الأولية
 *     reorder_level?: number,
 *     notes?: string
 *   }>
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
    const { store_id, items } = body;

    // === Validation ===
    if (!store_id) {
      return NextResponse.json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'المخزن مطلوب' } },
        { status: 400 }
      );
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'يجب إدخال صنف واحد على الأقل' } },
        { status: 400 }
      );
    }

    if (items.length > 20) {
      return NextResponse.json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'الحد الأقصى 20 صنف في المرة الواحدة' } },
        { status: 400 }
      );
    }

    // تحقق من وجود المخزن
    const store = await prisma.stores.findUnique({
      where: { id: store_id },
      select: { id: true, name: true }
    });

    if (!store) {
      return NextResponse.json(
        { ok: false, error: { code: 'NOT_FOUND', message: 'المخزن غير موجود' } },
        { status: 404 }
      );
    }

    const results: any[] = [];
    const errors: any[] = [];

    // معالجة كل صنف
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const rowNum = i + 1;

      try {
        // Validation للصنف
        if (!item.product_name || !String(item.product_name).trim()) {
          errors.push({ row: rowNum, error: 'اسم الصنف مطلوب' });
          continue;
        }

        const salePrice = Number(item.default_sale_price);
        const purchasePrice = Number(item.last_purchase_price);
        const quantity = Number(item.quantity);

        if (!Number.isFinite(salePrice) || salePrice < 0) {
          errors.push({ row: rowNum, name: item.product_name, error: 'سعر البيع غير صالح' });
          continue;
        }

        if (!Number.isFinite(purchasePrice) || purchasePrice < 0) {
          errors.push({ row: rowNum, name: item.product_name, error: 'سعر الشراء غير صالح' });
          continue;
        }

        if (!Number.isFinite(quantity) || quantity < 0) {
          errors.push({ row: rowNum, name: item.product_name, error: 'الكمية غير صالحة' });
          continue;
        }

        const unitsPerCarton = Number(item.units_per_carton) || 1;
        if (unitsPerCarton < 1) {
          errors.push({ row: rowNum, name: item.product_name, error: 'قطع/كرتونة يجب أن تكون 1 على الأقل' });
          continue;
        }

        const productName = String(item.product_name).trim();

        // التحقق من وجود الصنف في نفس المخزن
        const existingInventory = await prisma.inventory.findFirst({
          where: {
            product: { name: { equals: productName, mode: 'insensitive' } },
            store_id: store_id
          },
          include: {
            product: { select: { id: true, name: true } }
          }
        });

        if (existingInventory) {
          errors.push({ 
            row: rowNum, 
            name: item.product_name, 
            error: `الصنف موجود بالفعل في المخزن (${existingInventory.product.name})` 
          });
          continue;
        }

        // البحث عن الصنف في قاعدة البيانات
        let product = await prisma.products.findFirst({
          where: { name: { equals: productName, mode: 'insensitive' } }
        });

        // إنشاء الصنف إذا لم يكن موجوداً
        if (!product) {
          product = await prisma.products.create({
            data: {
              name: productName,
              description: item.description || null,
              category: item.category ? String(item.category).trim() : null,
              unit: item.unit || 'piece',
              units_per_carton: unitsPerCarton,
              barcode: item.barcode || null,
              default_sale_price: salePrice,
              last_purchase_price: purchasePrice,
              reorder_level: Number(item.reorder_level) || 5,
              notes: item.notes || null,
              is_active: true
            }
          });
        } else {
          // تحديث سعر البيع والشراء إذا كان الصنف موجوداً
          product = await prisma.products.update({
            where: { id: product.id },
            data: {
              default_sale_price: salePrice,
              last_purchase_price: purchasePrice,
              last_purchase_date: new Date()
            }
          });
        }

        // إضافة الكمية في المخزون
        const inventory = await prisma.inventory.create({
          data: {
            product_id: product.id,
            store_id: store_id,
            current_stock: quantity,
            opening_balance: quantity,
            reorder_level: Number(item.reorder_level) || product.reorder_level || 5,
            notes: item.notes || null
          }
        });

        // تسجيل التعديل كإضافة أولية
        if (quantity > 0) {
          await prisma.inventory_adjustments.create({
            data: {
              inventory_id: inventory.id,
              product_id: product.id,
              product_name: product.name,
              store_id: store_id,
              store_name: store.name,
              old_quantity: 0,
              new_quantity: quantity,
              difference: quantity,
              adjustment_type: 'إضافة أولية',
              unit_cost: purchasePrice,
              financial_impact: quantity * purchasePrice,
              reason: 'إدخال بضاعة أولية عند بدء النظام',
              notes: item.notes || null,
              adjusted_by: profile.id
            }
          });
        }

        results.push({
          row: rowNum,
          product_id: product.id,
          product_name: product.name,
          inventory_id: inventory.id,
          quantity: quantity,
          success: true
        });

      } catch (err: any) {
        errors.push({ 
          row: rowNum, 
          name: item.product_name, 
          error: err?.message || 'خطأ غير معروف' 
        });
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        total: items.length,
        success_count: results.length,
        error_count: errors.length,
        results,
        errors
      }
    });

  } catch (e: any) {
    console.error('Bulk add error:', e);
    return NextResponse.json(
      { ok: false, error: { code: 'SERVER_ERROR', message: e?.message || 'خطأ في الخادم' } },
      { status: 500 }
    );
  }
}
