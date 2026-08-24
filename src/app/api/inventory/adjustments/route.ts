import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth-server';

/**
 * GET /api/inventory/adjustments
 * سجل تعديلات المخزون (الجرد)
 *
 * Query params:
 * - store_id?: string
 * - product_id?: string
 * - adjustment_type?: string
 * - from_date?: string (ISO date)
 * - to_date?: string (ISO date)
 * - page?: number (default: 1)
 * - limit?: number (default: 50)
 */
export async function GET(request: NextRequest) {
  const profile = await getCurrentUser();
  if (!profile) {
    return NextResponse.json(
      { ok: false, error: { code: 'UNAUTHORIZED', message: 'غير مسجل' } },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('store_id') || '';
    const productId = searchParams.get('product_id') || '';
    const adjustmentType = searchParams.get('adjustment_type') || '';
    const fromDate = searchParams.get('from_date') || '';
    const toDate = searchParams.get('to_date') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;

    const where: any = {};

    if (storeId) {
      where.store_id = storeId;
    }

    if (productId) {
      where.product_id = productId;
    }

    if (adjustmentType) {
      where.adjustment_type = adjustmentType;
    }

    if (fromDate || toDate) {
      where.adjustment_date = {};
      if (fromDate) {
        where.adjustment_date.gte = new Date(fromDate);
      }
      if (toDate) {
        const to = new Date(toDate);
        to.setHours(23, 59, 59, 999);
        where.adjustment_date.lte = to;
      }
    }

    const [items, total] = await Promise.all([
      prisma.inventory_adjustments.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              full_name: true,
              username: true
            }
          }
        },
        orderBy: { adjustment_date: 'desc' },
        take: limit,
        skip: offset
      }),
      prisma.inventory_adjustments.count({ where })
    ]);

    // إخفاء التكاليف للمستخدمين غير المصرح لهم
    const sanitized = items.map(item => ({
      ...item,
      unit_cost: profile.can_see_cost ? item.unit_cost : null,
      financial_impact: profile.can_see_cost ? item.financial_impact : null
    }));

    return NextResponse.json(
      {
        ok: true,
        data: {
          items: sanitized,
          total,
          page,
          limit
        }
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );

  } catch (e: any) {
    console.error('Adjustments fetch error:', e);
    return NextResponse.json(
      { ok: false, error: { code: 'SERVER_ERROR', message: e?.message || 'خطأ في الخادم' } },
      { status: 500 }
    );
  }
}
