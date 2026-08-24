import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth-server';
import bcrypt from 'bcryptjs';

// PATCH /api/auth/change-password - تغيير كلمة المرور
export async function PATCH(request: NextRequest) {
  const profile = await getCurrentUser();
  if (!profile) {
    return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { old_password, new_password } = body;

    if (!old_password || !new_password) {
      return NextResponse.json(
        { ok: false, error: { code: 'MISSING_FIELDS', message: 'كلمة المرور القديمة والجديدة مطلوبة' } },
        { status: 400 }
      );
    }

    if (new_password.length < 4) {
      return NextResponse.json(
        { ok: false, error: { code: 'WEAK_PASSWORD', message: 'كلمة المرور يجب أن تكون 4 أحرف على الأقل' } },
        { status: 400 }
      );
    }

    // جلب المستخدم من قاعدة البيانات
    const user = await prisma.users.findUnique({
      where: { id: profile.id },
    });

    if (!user) {
      return NextResponse.json({ ok: false, error: { code: 'USER_NOT_FOUND' } }, { status: 404 });
    }

    // التحقق من كلمة المرور القديمة
    const isValid = await bcrypt.compare(old_password, user.password_hash);
    if (!isValid) {
      return NextResponse.json(
        { ok: false, error: { code: 'INVALID_PASSWORD', message: 'كلمة المرور القديمة غير صحيحة' } },
        { status: 400 }
      );
    }

    // تشفير كلمة المرور الجديدة
    const hashedPassword = await bcrypt.hash(new_password, 10);

    // تحديث كلمة المرور
    await prisma.users.update({
      where: { id: profile.id },
      data: { password_hash: hashedPassword },
    });

    return NextResponse.json({ ok: true, data: { message: 'تم تغيير كلمة المرور بنجاح' } });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: { code: 'DB_ERROR', message: e?.message || 'حدث خطأ' } },
      { status: 500 }
    );
  }
}
