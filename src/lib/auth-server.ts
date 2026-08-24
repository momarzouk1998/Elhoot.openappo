// Server-only auth helpers
import { cookies } from 'next/headers';
import prisma from '@/lib/db/prisma';
import { COOKIE_NAME, verifySession } from '@/lib/db/auth';
import type { CurrentProfile, UserRole } from '@/lib/auth';

export async function getCurrentUser(): Promise<CurrentProfile | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;
    const payload = await verifySession(token);
    if (!payload) return null;
    const user = await prisma.users.findFirst({
      where: { id: payload.sub, is_active: true },
      select: {
        id: true, username: true, full_name: true, role: true,
        can_see_cost: true, is_active: true,
      },
    });
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role as UserRole,
      can_see_cost: user.can_see_cost,
      is_active: user.is_active,
    };
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<CurrentProfile> {
  const u = await getCurrentUser();
  if (!u) throw new Error('UNAUTHORIZED');
  return u;
}

export async function requireAdmin(): Promise<CurrentProfile> {
  const u = await requireUser();
  if (u.role !== 'admin') throw new Error('FORBIDDEN');
  return u;
}
