import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth-server';

export async function GET() {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  const checks = await prisma.checks.findMany({
    orderBy: { due_date: 'asc' },
    take: 200,
  });
  return NextResponse.json({ ok: true, data: { items: checks, total: checks.length } });
}

export async function POST(request: NextRequest) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  try {
    const body = await request.json();
    const check = await prisma.checks.create({
      data: {
        direction: body.direction || 'incoming',
        bank_name: body.bank_name || null,
        check_number: body.check_number || null,
        amount: body.amount,
        issue_date: new Date(body.issue_date),
        due_date: new Date(body.due_date),
        status: 'تحت التحصيل',
        customer_id: body.customer_id || null,
        supplier_id: body.supplier_id || null,
        treasury_id: body.treasury_id || null,
        notes: body.notes || null,
        created_by: profile.id,
      },
    });
    return NextResponse.json({ ok: true, data: check });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: 'DB_ERROR', message: e?.message } }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });

  try {
    const body = await request.json();
    const { id, status, treasury_id } = body;

    if (!id || !status) {
      return NextResponse.json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'الرقم ومعرف الحالة مطلوبان' } }, { status: 400 });
    }

    const validStatuses = ['تحت التحصيل', 'تم الصرف', 'مرفوض', 'مُلغى'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ ok: false, error: { code: 'INVALID_STATUS' } }, { status: 400 });
    }

    const existing = await prisma.checks.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ ok: false, error: { code: 'NOT_FOUND' } }, { status: 404 });
    }

    if (existing.created_by !== profile.id && profile.role !== 'admin') {
      return NextResponse.json({ ok: false, error: { code: 'FORBIDDEN' } }, { status: 403 });
    }

    const effectiveTreasuryId = existing.treasury_id || treasury_id || null;

    const updated = await prisma.$transaction(async (tx) => {
      if (status === 'تم الصرف' && existing.status !== 'تم الصرف') {
        if (!effectiveTreasuryId) {
          throw new Error('NO_TREASURY');
        }

        const treasury = await tx.treasuries.findUnique({ where: { id: effectiveTreasuryId } });
        if (!treasury) throw new Error('TREASURY_NOT_FOUND');

        const amount = Number(existing.amount);
        const direction = existing.direction === 'incoming' ? 'in' : 'out';
        const operation = direction === 'in' ? 'increment' : 'decrement';

        // السماح بالسالب: تمت إزالة شرط رصيد الخزينة للشيكات الصادرة

        await tx.treasuries.update({
          where: { id: effectiveTreasuryId },
          data: { current_balance: { [operation]: amount } },
        });

        await tx.treasury_transactions.create({
          data: {
            treasury_id: effectiveTreasuryId,
            direction,
            amount,
            reference_type: 'check',
            reference_id: existing.id,
            status: 'accepted',
            by_user_id: profile.id,
          },
        });

        // تسديد شيك صادر لمورد: ينشئ سداد مورد ويخصم من رصيد المورد
        if (direction === 'out' && existing.supplier_id) {
          await tx.supplier_payments.create({
            data: {
              supplier_id: existing.supplier_id,
              amount,
              payment_method: 'شيك',
              treasury_id: effectiveTreasuryId,
              payment_date: new Date(),
              notes: `تسديد شيك رقم ${existing.check_number || '—'} بنك ${existing.bank_name || '—'}`,
            },
          });
          await tx.suppliers.update({
            where: { id: existing.supplier_id },
            data: { balance: { decrement: amount } },
          });
        }
      }

      return tx.checks.update({
        where: { id },
        data: {
          status,
          treasury_id: effectiveTreasuryId,
          updated_at: new Date(),
        },
      });
    });

    return NextResponse.json({ ok: true, data: updated });
  } catch (e: any) {
    if (e?.message === 'NO_TREASURY' || e?.message === 'TREASURY_NOT_FOUND' || e?.message === 'INSUFFICIENT_FUNDS') {
      const messages: Record<string, string> = {
        NO_TREASURY: 'يجب اختيار خزينة لصرف الشيك',
        TREASURY_NOT_FOUND: 'الخزينة غير موجودة',
        INSUFFICIENT_FUNDS: 'رصيد الخزينة غير كافي لصرف الشيك',
      };
      return NextResponse.json({ ok: false, error: { code: e.message, message: messages[e.message] } }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: { code: 'DB_ERROR', message: e?.message } }, { status: 500 });
  }
}
