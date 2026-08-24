import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth-server';
import { hashPassword } from '@/lib/db/auth';
import { Prisma } from '@prisma/client';

function buildArabicVariations(term: string): string[] {
  const vars = new Set<string>();
  vars.add(term);
  vars.add(term.replace(/ة/g, 'ه'));
  vars.add(term.replace(/ه/g, 'ة'));
  const alefNorm = term.replace(/[أإآٱ]/g, 'ا');
  vars.add(alefNorm);
  vars.add(alefNorm.replace(/ة/g, 'ه'));
  vars.add(alefNorm.replace(/ه/g, 'ة'));
  vars.add(alefNorm.replace(/ي/g, 'ى'));
  vars.add(alefNorm.replace(/ى/g, 'ي'));
  return Array.from(vars).filter(Boolean);
}

export async function GET(request: NextRequest) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'غير مسجل' } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search')?.trim() || '';
  const category = searchParams.get('category') || '';
  const limit = parseInt(searchParams.get('limit') || '50');
  const page = parseInt(searchParams.get('page') || '1');
  const offset = (page - 1) * limit;

  const where: Prisma.productsWhereInput = { is_active: true };
  if (search) {
    const tokens = search.split(/\s+/).filter(Boolean);
    if (tokens.length === 1) {
      const vars = buildArabicVariations(tokens[0]);
      where.OR = vars.map(v => ({
        name: { contains: v, mode: 'insensitive' }
      }));
    } else if (tokens.length > 1) {
      where.AND = tokens.map(token => {
        const vars = buildArabicVariations(token);
        return {
          OR: vars.map(v => ({
            name: { contains: v, mode: 'insensitive' }
          }))
        };
      });
    }
  }
  if (category) where.category = category;

  const lowStockOnly = searchParams.get('low_stock') === '1';

  if (lowStockOnly) {
    // جلب كافة الأصناف وفلترة النواقص وتحت الحد الأدنى
    const allProducts = await prisma.products.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        inventory_items: { select: { current_stock: true, store_id: true, store: { select: { name: true } } } },
      },
    });

    const augmented = allProducts.map(p => ({
      ...p,
      total_stock: p.inventory_items.reduce((sum, i) => sum + Number(i.current_stock), 0),
      last_purchase_price: profile.can_see_cost ? p.last_purchase_price : null,
      last_purchase_date: profile.can_see_cost ? p.last_purchase_date : null,
    }));

    const lowStockItems = augmented.filter(p => p.total_stock <= p.reorder_level);

    let totalStockValue = 0;
    for (const p of allProducts) {
      const pStock = p.inventory_items.reduce((s, i) => s + Number(i.current_stock), 0);
      if (profile.can_see_cost) {
        totalStockValue += pStock * Number(p.last_purchase_price || 0);
      }
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          items: lowStockItems,
          total: lowStockItems.length,
          limit: lowStockItems.length,
          page: 1,
          stats: {
            total_products: allProducts.length,
            low_stock_count: lowStockItems.length,
            total_stock_value: totalStockValue,
          },
        },
      },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  }

  const [items, total, allProductsForStats] = await Promise.all([
    prisma.products.findMany({
      where,
      orderBy: { name: 'asc' },
      take: limit,
      skip: offset,
      include: {
        inventory_items: { select: { current_stock: true, store_id: true, store: { select: { name: true } } } },
      },
    }),
    prisma.products.count({ where }),
    prisma.products.findMany({
      where,
      select: {
        reorder_level: true,
        last_purchase_price: true,
        inventory_items: { select: { current_stock: true } },
      },
    }),
  ]);

  let totalStockValue = 0;
  let lowStockCount = 0;

  for (const p of allProductsForStats) {
    const pStock = p.inventory_items.reduce((s, i) => s + Number(i.current_stock), 0);
    if (pStock <= Number(p.reorder_level || 0)) {
      lowStockCount++;
    }
    if (profile.can_see_cost) {
      totalStockValue += pStock * Number(p.last_purchase_price || 0);
    }
  }

  // Augment with total stock
  const augmented = items.map(p => ({
    ...p,
    total_stock: p.inventory_items.reduce((sum, i) => sum + Number(i.current_stock), 0),
    // Hide cost for non-privileged - تحسين الحماية
    last_purchase_price: profile.can_see_cost ? p.last_purchase_price : null,
    last_purchase_date: profile.can_see_cost ? p.last_purchase_date : null,
  }));

  return NextResponse.json(
    {
      ok: true,
      data: {
        items: augmented,
        total,
        limit,
        page,
        stats: {
          total_products: total,
          low_stock_count: lowStockCount,
          total_stock_value: totalStockValue,
        },
      },
    },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  );
}

export async function POST(request: NextRequest) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });

  try {
    const body = await request.json();
    // === فاليديشن ===
    if (!body.name || !String(body.name).trim()) {
      return NextResponse.json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'اسم الصنف مطلوب' } }, { status: 400 });
    }
    const salePrice = body.default_sale_price !== undefined && body.default_sale_price !== null && body.default_sale_price !== ''
      ? Number(body.default_sale_price)
      : 0;
    const purchasePrice = body.last_purchase_price !== undefined && body.last_purchase_price !== null && body.last_purchase_price !== ''
      ? Number(body.last_purchase_price)
      : 0;
    if (!Number.isFinite(salePrice) || salePrice < 0) {
      return NextResponse.json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'سعر البيع غير صالح' } }, { status: 400 });
    }
    if (!Number.isFinite(purchasePrice) || purchasePrice < 0) {
      return NextResponse.json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'سعر الشراء غير صالح' } }, { status: 400 });
    }
    const unitsPerCarton = Number(body.units_per_carton) || 1;
    if (unitsPerCarton < 1) {
      return NextResponse.json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'قطع/كرتونة يجب أن تكون 1 على الأقل' } }, { status: 400 });
    }
    const initialStock = Number(body.initial_stock) || 0;
    const storeId = body.store_id;

    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.products.create({
        data: {
          name: String(body.name).trim(),
          description: body.description || null,
          category: body.category || null,
          unit: body.unit || 'piece',
          units_per_carton: unitsPerCarton,
          barcode: body.barcode || null,
          default_sale_price: salePrice,
          reorder_level: Number(body.reorder_level) || 5,
          notes: body.notes || null,
          last_purchase_price: purchasePrice,
        },
      });

      if (initialStock > 0) {
        let targetStoreId = storeId;
        let targetStoreName = 'المخزن الرئيسي';
        if (!targetStoreId) {
          const firstStore = await tx.stores.findFirst({
            where: { is_active: true },
            orderBy: { created_at: 'asc' },
          });
          if (firstStore) {
            targetStoreId = firstStore.id;
            targetStoreName = firstStore.name;
          }
        } else {
          const storeRec = await tx.stores.findUnique({ where: { id: targetStoreId } });
          if (storeRec) targetStoreName = storeRec.name;
        }

        if (targetStoreId) {
          const inv = await tx.inventory.create({
            data: {
              product_id: created.id,
              store_id: targetStoreId,
              current_stock: initialStock,
            },
          });

          await tx.inventory_adjustments.create({
            data: {
              inventory_id: inv.id,
              product_id: created.id,
              product_name: created.name,
              store_id: targetStoreId,
              store_name: targetStoreName,
              old_quantity: 0,
              new_quantity: initialStock,
              difference: initialStock,
              adjustment_type: 'إضافة أولية',
              unit_cost: purchasePrice,
              financial_impact: initialStock * purchasePrice,
              reason: 'رصيد أول المدة عند إنشاء الصنف',
              adjusted_by: profile?.id,
            },
          });
        }
      }

      return created;
    });

    return NextResponse.json({ ok: true, data: product });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: 'DB_ERROR', message: e?.message } }, { status: 500 });
  }
}
