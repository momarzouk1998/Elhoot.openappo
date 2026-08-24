import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth-server';
import { hashPassword } from '@/lib/db/auth';

// PATCH /api/users/[id] - تعديل مستخدم
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentUser();
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ ok: false, error: { code: 'FORBIDDEN' } }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.users.findUnique({ where: { id: Number(id) } });
    if (!existing) return NextResponse.json({ ok: false, error: { code: 'NOT_FOUND' } }, { status: 404 });

    const data: any = {
      ...(body.full_name !== undefined && { full_name: String(body.full_name).trim() }),
      ...(body.phone !== undefined && { phone: body.phone || null }),
      ...(body.whatsapp !== undefined && { whatsapp: body.whatsapp || null }),
      ...(body.email !== undefined && { email: body.email || null }),
      ...(body.role !== undefined && { role: body.role }),
      ...(body.can_see_cost !== undefined && { can_see_cost: !!body.can_see_cost }),
      ...(body.default_store_id !== undefined && { default_store_id: body.default_store_id || null }),
      ...(body.is_active !== undefined && { is_active: !!body.is_active }),
      updated_at: new Date(),
    };
    if (body.password) {
      if (String(body.password).length < 4) {
        return NextResponse.json(
          { ok: false, error: { code: 'VALIDATION_ERROR', message: 'كلمة المرور قصيرة جداً' } },
          { status: 400 }
        );
      }
      data.password_hash = await hashPassword(body.password);
    }

    const updated = await prisma.users.update({
      where: { id: Number(id) },
      data,
    });
    return NextResponse.json({ ok: true, data: { id: updated.id, username: updated.username, full_name: updated.full_name } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: 'DB_ERROR', message: e?.message } }, { status: 500 });
  }
}

// DELETE /api/users/[id] - حذف مستخدم نهائياً (admin only)
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentUser();
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ ok: false, error: { code: 'FORBIDDEN' } }, { status: 403 });
  }

  try {
    const { id } = await params;
    const numId = Number(id);
    if (numId === profile.id) {
      return NextResponse.json(
        { ok: false, error: { code: 'CANNOT_DELETE_SELF', message: 'لا يمكنك حذف حسابك بنفسك' } },
        { status: 400 }
      );
    }
    
    // حذف نهائي
    await prisma.users.delete({
      where: { id: numId },
    });
    
    return NextResponse.json({ ok: true, data: { message: 'تم حذف المستخدم نهائياً' } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: 'DB_ERROR', message: e?.message } }, { status: 500 });
  }
}
