import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth-server';

export async function GET(request: NextRequest) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('store_id') || '';
  const category = searchParams.get('category') || '';
  const lowStock = searchParams.get('low_stock') === '1';
  const search = searchParams.get('search')?.trim() || '';
  const limit = parseInt(searchParams.get('limit') || '50');
  const page = parseInt(searchParams.get('page') || '1');
  const offset = (page - 1) * limit;

  const where: any = {};
  if (storeId) where.store_id = storeId;

  if (search || category) {
    where.product = {};
    if (search) {
      where.product.name = { contains: search, mode: 'insensitive' };
    }
    if (category) {
      const trimmed = category.trim();
      where.product.category = { contains: trimmed, mode: 'insensitive' };
    }
  }

  if (lowStock) {
    const allItems = await prisma.inventory.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            category: true,
            unit: true,
            units_per_carton: true,
            reorder_level: true,
            last_purchase_price: true,
          },
        },
        store: { select: { id: true, name: true, type: true } },
      },
      orderBy: { product: { name: 'asc' } },
    });

    const filtered = allItems.filter(
      (item) => Number(item.current_stock) <= Number(item.product.reorder_level)
    );

    const augmented = filtered.map(i => ({
      ...i,
      product: {
        ...i.product,
        last_purchase_price: profile.can_see_cost ? i.product.last_purchase_price : null,
      },
      value: profile.can_see_cost ? Number(i.current_stock) * Number(i.product.last_purchase_price) : null,
    }));

    return NextResponse.json(
      { ok: true, data: { items: augmented, total: augmented.length, limit: augmented.length, page: 1 } },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  }

  const [items, total] = await Promise.all([
    prisma.inventory.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            category: true,
            unit: true,
            units_per_carton: true,
            reorder_level: true,
            last_purchase_price: true,
          },
        },
        store: { select: { id: true, name: true, type: true } },
      },
      orderBy: { product: { name: 'asc' } },
      take: limit,
      skip: offset,
    }),
    prisma.inventory.count({ where }),
  ]);

  const filtered = lowStock
    ? items.filter((item) => Number(item.current_stock) <= Number(item.product.reorder_level))
    : items;

  // Augment: hide cost for non-privileged
  const augmented = filtered.map(i => ({
    ...i,
    product: {
      ...i.product,
      last_purchase_price: profile.can_see_cost ? i.product.last_purchase_price : null,
    },
    value: profile.can_see_cost ? Number(i.current_stock) * Number(i.product.last_purchase_price) : null,
  }));

  return NextResponse.json(
    { ok: true, data: { items: augmented, total, limit, page } },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  );
}
