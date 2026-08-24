import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth-server';

/**
 * GET /api/stores - جلب كل المخازن والفروع
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
    const stores = await prisma.stores.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        description: true,
        assigned_user_id: true,
        is_active: true,
        created_at: true,
        _count: {
          select: {
            inventory: true,
            sales_invoices: true
          }
        }
      },
      orderBy: [
        { is_active: 'desc' },
        { name: 'asc' }
      ]
    });

    // إضافة إحصائيات لكل مخزن
    const storesWithStats = stores.map(store => ({
      ...store,
      stats: {
        total_products: store._count.inventory,
        total_sales: store._count.sales_invoices
      }
    }));

    return NextResponse.json(
      {
        ok: true,
        data: {
          items: storesWithStats,
          total: stores.length
        }
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );

  } catch (e: any) {
    console.error('Stores fetch error:', e);
    return NextResponse.json(
      { ok: false, error: { code: 'SERVER_ERROR', message: e?.message || 'خطأ في الخادم' } },
      { status: 500 }
    );
  }
}

/**
 * POST /api/stores - إضافة مخزن/فرع جديد
 */
export async function POST(request: NextRequest) {
  const profile = await getCurrentUser();
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json(
      { ok: false, error: { code: 'FORBIDDEN', message: 'صلاحيات أدمن مطلوبة' } },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { name, type, description, assigned_user_id } = body;

    // التحقق من البيانات المطلوبة
    if (!name || !type) {
      return NextResponse.json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'الاسم والنوع مطلوبان' } },
        { status: 400 }
      );
    }

    // التحقق من عدم تكرار الاسم
    const existingStore = await prisma.stores.findFirst({
      where: { 
        name: { equals: name.trim(), mode: 'insensitive' },
        is_active: true 
      }
    });

    if (existingStore) {
      return NextResponse.json(
        { ok: false, error: { code: 'DUPLICATE_ERROR', message: 'يوجد مخزن بنفس الاسم' } },
        { status: 400 }
      );
    }

    // إنشاء المخزن الجديد
    const newStore = await prisma.stores.create({
      data: {
        name: name.trim(),
        type,
        description: description?.trim() || null,
        assigned_user_id: assigned_user_id || null,
        is_active: true
      },
      select: {
        id: true,
        name: true,
        type: true,
        description: true,
        assigned_user_id: true,
        is_active: true
      }
    });

    return NextResponse.json({
      ok: true,
      data: newStore,
      message: `✅ تم إضافة ${newStore.name} بنجاح`
    });

  } catch (e: any) {
    console.error('Store creation error:', e);
    return NextResponse.json(
      { ok: false, error: { code: 'SERVER_ERROR', message: e?.message || 'خطأ في الخادم' } },
      { status: 500 }
    );
  }
}