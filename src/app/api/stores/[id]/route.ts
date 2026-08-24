import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth-server';

/**
 * PUT /api/stores/[id] - تعديل مخزن/فرع
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getCurrentUser();
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json(
      { ok: false, error: { code: 'FORBIDDEN', message: 'صلاحيات أدمن مطلوبة' } },
      { status: 403 }
    );
  }

  try {
    const { id: storeId } = await params;
    const body = await request.json();
    const { name, type, description, assigned_user_id, is_active } = body;

    // التحقق من وجود المخزن
    const existingStore = await prisma.stores.findUnique({
      where: { id: storeId }
    });

    if (!existingStore) {
      return NextResponse.json(
        { ok: false, error: { code: 'NOT_FOUND', message: 'المخزن غير موجود' } },
        { status: 404 }
      );
    }

    // التحقق من البيانات المطلوبة
    if (!name || !type) {
      return NextResponse.json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'الاسم والنوع مطلوبان' } },
        { status: 400 }
      );
    }

    // التحقق من عدم تكرار الاسم (مع استثناء المخزن الحالي)
    const duplicateStore = await prisma.stores.findFirst({
      where: { 
        name: { equals: name.trim(), mode: 'insensitive' },
        id: { not: storeId },
        is_active: true 
      }
    });

    if (duplicateStore) {
      return NextResponse.json(
        { ok: false, error: { code: 'DUPLICATE_ERROR', message: 'يوجد مخزن آخر بنفس الاسم' } },
        { status: 400 }
      );
    }

    // تحديث المخزن
    const updatedStore = await prisma.stores.update({
      where: { id: storeId },
      data: {
        name: name.trim(),
        type,
        description: description?.trim() || null,
        assigned_user_id: assigned_user_id || null,
        is_active: is_active !== undefined ? is_active : true,
        updated_at: new Date()
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
      data: updatedStore,
      message: `✅ تم تعديل ${updatedStore.name} بنجاح`
    });

  } catch (e: any) {
    console.error('Store update error:', e);
    return NextResponse.json(
      { ok: false, error: { code: 'SERVER_ERROR', message: e?.message || 'خطأ في الخادم' } },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/stores/[id] - حذف مخزن/فرع (soft delete)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getCurrentUser();
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json(
      { ok: false, error: { code: 'FORBIDDEN', message: 'صلاحيات أدمن مطلوبة' } },
      { status: 403 }
    );
  }

  try {
    const { id: storeId } = await params;

    // التحقق من وجود المخزن
    const existingStore = await prisma.stores.findUnique({
      where: { id: storeId },
      include: {
        _count: {
          select: {
            inventory: true,
            sales_invoices: true
          }
        }
      }
    });

    if (!existingStore) {
      return NextResponse.json(
        { ok: false, error: { code: 'NOT_FOUND', message: 'المخزن غير موجود' } },
        { status: 404 }
      );
    }

    // التحقق من عدم وجود بيانات مرتبطة
    const hasInventory = existingStore._count.inventory > 0;
    const hasSales = existingStore._count.sales_invoices > 0;

    if (hasInventory || hasSales) {
      // soft delete إذا كانت هناك بيانات مرتبطة
      const updatedStore = await prisma.stores.update({
        where: { id: storeId },
        data: {
          is_active: false,
          updated_at: new Date()
        }
      });

      return NextResponse.json({
        ok: true,
        data: updatedStore,
        message: `⚠️ تم إلغاء تفعيل ${existingStore.name} (يحتوي على بيانات مرتبطة)`,
        soft_deleted: true
      });
    } else {
      // hard delete إذا لم تكن هناك بيانات مرتبطة
      await prisma.stores.delete({
        where: { id: storeId }
      });

      return NextResponse.json({
        ok: true,
        message: `✅ تم حذف ${existingStore.name} نهائياً`,
        hard_deleted: true
      });
    }

  } catch (e: any) {
    console.error('Store delete error:', e);
    return NextResponse.json(
      { ok: false, error: { code: 'SERVER_ERROR', message: e?.message || 'خطأ في الخادم' } },
      { status: 500 }
    );
  }
}