import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth-server";

// PATCH /api/transfers/[id] — تعديل تحويل (بحذر)
// قواعد:
//   - نفس اليوم فقط
//   - لا نسمح بتغيير product_id أو المخازن (لتجنب تعقيد المخزون)
//   - يمكن تعديل: الكمية، الملاحظات، التاريخ، الحالة (إلغاء)
//   - تعديل الكمية يعدّل حركات المخزون (خصم/إضافة) بحسب الفرق
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (profile.role === "rep") {
    return NextResponse.json({ ok: false, error: { code: "FORBIDDEN", message: "لا تملك صلاحية التعديل" } }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.stock_transfers.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "التحويل غير موجود" } }, { status: 404 });

    // نفس اليوم فقط
    const today = new Date();
    const expDate = new Date(existing.created_at || existing.transfer_date);
    const isSameDay = expDate.toDateString() === today.toDateString();
    if (!isSameDay) {
      return NextResponse.json(
        { ok: false, error: { code: "EDIT_EXPIRED", message: "لا يمكن تعديل تحويل من يوم آخر. احذفه وأنشئ واحداً جديداً." } },
        { status: 400 }
      );
    }

    // رفض تغيير product_id أو المخازن
    if (body.product_id && body.product_id !== existing.product_id) {
      return NextResponse.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "لا يمكن تغيير المنتج في تحويل قائم" } }, { status: 400 });
    }
    if (body.from_store_id && body.from_store_id !== existing.from_store_id) {
      return NextResponse.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "لا يمكن تغيير المخزن المصدر" } }, { status: 400 });
    }
    if (body.to_store_id && body.to_store_id !== existing.to_store_id) {
      return NextResponse.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "لا يمكن تغيير المخزن الوجهة" } }, { status: 400 });
    }

    // تعديل الكمية يتطلب تعديل حركات المخزون
    if (body.quantity !== undefined && Number(body.quantity) !== Number(existing.quantity)) {
      const newQty = Number(body.quantity);
      if (!Number.isFinite(newQty) || newQty <= 0) {
        return NextResponse.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "الكمية غير صالحة" } }, { status: 400 });
      }
      const diff = newQty - Number(existing.quantity);

      return await prisma.$transaction(async (tx) => {
        // لو الفرق موجب (زيادة)، لازم المخزن المصدر يكفي
        if (diff > 0) {
          const sourceInv = await tx.inventory.findUnique({
            where: { product_id_store_id: { product_id: existing.product_id, store_id: existing.from_store_id } },
          });
          if (!sourceInv || Number(sourceInv.current_stock) < diff) {
            const available = sourceInv ? Number(sourceInv.current_stock) : 0;
            throw new Error(`المخزن المصدر لا يكفي للزيادة (متاح: ${available})`);
          }
        }
        // تعديل المخزن المصدر بحسب الفرق
        await tx.inventory.update({
          where: { product_id_store_id: { product_id: existing.product_id, store_id: existing.from_store_id } },
          data: { current_stock: { decrement: diff } },
        });
        // تعديل المخزن الوجهة بحسب الفرق
        await tx.inventory.upsert({
          where: { product_id_store_id: { product_id: existing.product_id, store_id: existing.to_store_id } },
          update: { current_stock: { increment: diff } },
          create: { product_id: existing.product_id, store_id: existing.to_store_id, current_stock: diff, opening_balance: 0 },
        });
        const updated = await tx.stock_transfers.update({
          where: { id },
          data: {
            quantity: newQty,
            ...(body.notes !== undefined && { notes: body.notes || null }),
            ...(body.transfer_date !== undefined && { transfer_date: new Date(body.transfer_date) }),
            ...(body.status !== undefined && { status: body.status }),
          },
        });
        return NextResponse.json({ ok: true, data: updated });
      });
    }

    const updated = await prisma.stock_transfers.update({
      where: { id },
      data: {
        ...(body.notes !== undefined && { notes: body.notes || null }),
        ...(body.transfer_date !== undefined && { transfer_date: new Date(body.transfer_date) }),
        ...(body.status !== undefined && { status: body.status }),
      },
    });
    return NextResponse.json({ ok: true, data: updated });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: "DB_ERROR", message: e?.message || "حدث خطأ" } }, { status: 500 });
  }
}

// DELETE /api/transfers/[id] — عكس التحويل (إرجاع الكمية للمخزن المصدر)
// قواعد:
//   - نفس اليوم فقط
//   - لو التحويل ملغي بالفعل، رفض
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (profile.role === "rep") {
    return NextResponse.json({ ok: false, error: { code: "FORBIDDEN", message: "لا تملك صلاحية الحذف" } }, { status: 403 });
  }

  try {
    const { id } = await params;

    const existing = await prisma.stock_transfers.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "التحويل غير موجود" } }, { status: 404 });

    if (existing.status === "ملغاة") {
      return NextResponse.json({ ok: false, error: { code: "ALREADY_CANCELLED", message: "التحويل ملغي بالفعل" } }, { status: 400 });
    }

    // نفس اليوم فقط
    const today = new Date();
    const expDate = new Date(existing.created_at || existing.transfer_date);
    const isSameDay = expDate.toDateString() === today.toDateString();
    if (!isSameDay) {
      return NextResponse.json(
        { ok: false, error: { code: "DELETE_EXPIRED", message: "لا يمكن حذف تحويل من يوم آخر (أثر على تقارير مغلقة)." } },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      // 1. إرجاع الكمية للمخزن المصدر
      await tx.inventory.update({
        where: { product_id_store_id: { product_id: existing.product_id, store_id: existing.from_store_id } },
        data: { current_stock: { increment: Number(existing.quantity) } },
      });
      // 2. خصم من المخزن الوجهة
      await tx.inventory.update({
        where: { product_id_store_id: { product_id: existing.product_id, store_id: existing.to_store_id } },
        data: { current_stock: { decrement: Number(existing.quantity) } },
      });
      // 3. تعليم التحويل كملغي (نترك السجل لأغراض التدقيق)
      await tx.stock_transfers.update({
        where: { id },
        data: { status: "ملغاة" },
      });
    });

    return NextResponse.json({ ok: true, data: { deleted: true, quantity: Number(existing.quantity) } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: "DB_ERROR", message: e?.message || "حدث خطأ" } }, { status: 500 });
  }
}
