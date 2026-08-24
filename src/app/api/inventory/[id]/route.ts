import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth-server';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentUser();
  if (!profile || profile.role === 'rep') {
    return NextResponse.json({ ok: false, error: { code: 'FORBIDDEN', message: 'غير مصرح لك بحذف الصنف من المخزن' } }, { status: 403 });
  }

  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;
    
    // تأكد من وجود العنصر
    const item = await prisma.inventory.findUnique({
      where: { id }
    });
    
    if (!item) {
      return NextResponse.json({ ok: false, error: { code: 'NOT_FOUND', message: 'العنصر غير موجود' } }, { status: 404 });
    }

    // حذف العنصر من المخزن
    await prisma.inventory.delete({
      where: { id }
    });

    return NextResponse.json({ ok: true, message: 'تم حذف الصنف من المخزن بنجاح' });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: { code: 'INTERNAL_ERROR', message: error.message || 'حدث خطأ أثناء الحذف' } }, { status: 500 });
  }
}
