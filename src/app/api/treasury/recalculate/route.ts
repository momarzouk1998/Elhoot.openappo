import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth-server';

// POST /api/treasury/recalculate - إعادة حساب أرصدة جميع الخزائن من الحركات الفعلية
export async function POST() {
  const profile = await getCurrentUser();
  if (!profile || !['admin', 'manager', 'accountant'].includes(profile.role)) {
    return NextResponse.json({ ok: false, error: { code: 'FORBIDDEN', message: 'هذه العملية للإدارة فقط' } }, { status: 403 });
  }

  try {
    const treasuries = await prisma.treasuries.findMany();

    for (const t of treasuries) {
      const cpSum = await prisma.customer_payments.aggregate({
        where: { treasury_id: t.id },
        _sum: { amount: true },
      });
      const spSum = await prisma.supplier_payments.aggregate({
        where: { treasury_id: t.id },
        _sum: { amount: true },
      });
      const expSum = await prisma.expenses.aggregate({
        where: { treasury_id: t.id },
        _sum: { amount: true },
      });
      const txInSum = await prisma.treasury_transactions.aggregate({
        where: { treasury_id: t.id, direction: 'in', reference_type: { notIn: ['customer_payment', 'supplier_payment_cancellation'] } },
        _sum: { amount: true },
      });
      const txOutSum = await prisma.treasury_transactions.aggregate({
        where: { treasury_id: t.id, direction: 'out', reference_type: { notIn: ['supplier_payment', 'customer_payment_cancellation', 'expense'] } },
        _sum: { amount: true },
      });

      const opening = Number(t.opening_balance || 0);
      const totalIn = Number(cpSum._sum.amount || 0) + Number(txInSum._sum.amount || 0);
      const totalOut = Number(spSum._sum.amount || 0) + Number(expSum._sum.amount || 0) + Number(txOutSum._sum.amount || 0);

      const calculatedBalance = opening + totalIn - totalOut;

      await prisma.treasuries.update({
        where: { id: t.id },
        data: { current_balance: calculatedBalance, updated_at: new Date() },
      });
    }

    return NextResponse.json({ ok: true, message: 'تم إعادة حساب وتصفير أرصدة الخزائن بنجاح' });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: 'DB_ERROR', message: e?.message } }, { status: 500 });
  }
}
