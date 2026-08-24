import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth-server';
import { hashPassword } from '@/lib/db/auth';

// GET /api/users - قائمة المستخدمين (admin فقط)
export async function GET() {
  const profile = await getCurrentUser();
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ ok: false, error: { code: 'FORBIDDEN' } }, { status: 403 });
  }
  const users = await prisma.users.findMany({
    orderBy: { full_name: 'asc' },
    select: {
      id: true, username: true, full_name: true, phone: true, whatsapp: true, email: true,
      role: true, can_see_cost: true, is_active: true, last_login_at: true,
      default_store: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json({ ok: true, data: { items: users, total: users.length } });
}

// POST /api/users - إنشاء مستخدم جديد
export async function POST(request: NextRequest) {
  const profile = await getCurrentUser();
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ ok: false, error: { code: 'FORBIDDEN' } }, { status: 403 });
  }

  try {
    const body = await request.json();
    if (!body.username || !body.full_name || !body.password) {
      return NextResponse.json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'اسم المستخدم والاسم الكامل وكلمة المرور مطلوبة' } },
        { status: 400 }
      );
    }
    if (String(body.password).length < 4) {
      return NextResponse.json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'كلمة المرور قصيرة جداً (4 حروف على الأقل)' } },
        { status: 400 }
      );
    }

    const existing = await prisma.users.findUnique({ where: { username: body.username } });
    if (existing) {
      return NextResponse.json(
        { ok: false, error: { code: 'USERNAME_TAKEN', message: 'اسم المستخدم مستخدم بالفعل' } },
        { status: 400 }
      );
    }

    const password_hash = await hashPassword(body.password);
    const user = await prisma.users.create({
      data: {
        username: body.username,
        full_name: body.full_name,
        phone: body.phone || null,
        whatsapp: body.whatsapp || null,
        email: body.email || null,
        password_hash,
        role: body.role || 'rep',
        can_see_cost: !!body.can_see_cost,
        default_store_id: body.default_store_id || null,
        is_active: body.is_active !== false,
      },
    });
    return NextResponse.json({ ok: true, data: { id: user.id, username: user.username, full_name: user.full_name } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: 'DB_ERROR', message: e?.message } }, { status: 500 });
  }
}
