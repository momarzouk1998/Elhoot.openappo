import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth-server";
import { Prisma } from "@prisma/client";

// GET /api/transfers — قائمة التحويلات المخزنية
export async function GET(request: NextRequest) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const fromStore = searchParams.get("from_store_id") || "";
  const toStore = searchParams.get("to_store_id") || "";
  const status = searchParams.get("status") || "";
  const limit = parseInt(searchParams.get("limit") || "100");
  const offset = parseInt(searchParams.get("offset") || "0");

  const where: Prisma.stock_transfersWhereInput = {};
  if (fromStore) where.from_store_id = fromStore;
  if (toStore) where.to_store_id = toStore;
  if (status) where.status = status;

  const [items, total] = await Promise.all([
    prisma.stock_transfers.findMany({
      where,
      orderBy: { transfer_date: "desc" },
      take: limit,
      skip: offset,
      include: {
        from_store: { select: { id: true, name: true } },
        to_store: { select: { id: true, name: true } },
        by_user: { select: { id: true, full_name: true } },
      },
    }),
    prisma.stock_transfers.count({ where }),
  ]);

  return NextResponse.json({ ok: true, data: { items, total, limit, offset } });
}

// POST /api/transfers — تحويل مخزني فردي أو جماعي (transaction: خصم من مخزن + إضافة لآخر)
export async function POST(request: NextRequest) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });

  try {
    const body = await request.json();
    const { from_store_id, to_store_id, notes, transfer_date } = body;

    if (!from_store_id || !to_store_id) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: "المخزن المصدر والمخزن الوجهة مطلوبان" } },
        { status: 400 }
      );
    }
    if (from_store_id === to_store_id) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: "لا يمكن التحويل لنفس المخزن" } },
        { status: 400 }
      );
    }

    // تجهيز قائمة الأصناف (تحويل جماعي أو فردي)
    const rawItems: { product_id: string; quantity: number }[] = Array.isArray(body.items) && body.items.length > 0
      ? body.items
      : (body.product_id && body.quantity ? [{ product_id: body.product_id, quantity: Number(body.quantity) }] : []);

    if (rawItems.length === 0) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: "يجب اختيار صنف واحد على الأقل للتحويل" } },
        { status: 400 }
      );
    }

    const itemsToTransfer = rawItems.filter(i => i.product_id && Number.isFinite(Number(i.quantity)) && Number(i.quantity) > 0);
    if (itemsToTransfer.length === 0) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: "كميات الأصناف يجب أن تكون أكبر من الصفر" } },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const createdTransfers = [];
      const tDate = transfer_date ? new Date(transfer_date) : new Date();

      for (const item of itemsToTransfer) {
        const qty = Number(item.quantity);

        // 1. تحقق من توفر الكمية في المخزن المصدر
        const sourceInv = await tx.inventory.findUnique({
          where: { product_id_store_id: { product_id: item.product_id, store_id: from_store_id } },
        });
        const available = sourceInv ? Number(sourceInv.current_stock) : 0;
        if (!sourceInv || available < qty) {
          const product = await tx.products.findUnique({ where: { id: item.product_id }, select: { name: true } });
          throw new Error(`الكمية غير متوفرة للصنف "${product?.name || item.product_id}" في المخزن المصدر (متاح: ${available})`);
        }

        // 2. اسم المنتج
        const product = await tx.products.findUnique({ where: { id: item.product_id }, select: { name: true } });
        if (!product) throw new Error(`المنتج غير موجود (${item.product_id})`);

        // 3. خصم من المخزن المصدر
        await tx.inventory.update({
          where: { product_id_store_id: { product_id: item.product_id, store_id: from_store_id } },
          data: { current_stock: { decrement: qty } },
        });

        // 4. إضافة للمخزن الوجهة
        await tx.inventory.upsert({
          where: { product_id_store_id: { product_id: item.product_id, store_id: to_store_id } },
          update: { current_stock: { increment: qty } },
          create: { product_id: item.product_id, store_id: to_store_id, current_stock: qty, opening_balance: 0 },
        });

        // 5. سجل التحويل
        const transfer = await tx.stock_transfers.create({
          data: {
            product_id: item.product_id,
            product_name: product.name,
            from_store_id,
            to_store_id,
            quantity: qty,
            status: "مكتملة",
            notes: notes || (itemsToTransfer.length > 1 ? `تحويل جماعي (${itemsToTransfer.length} صنف)` : null),
            by_user_id: profile.id,
            transfer_date: tDate,
          },
        });
        createdTransfers.push(transfer);
      }

      return createdTransfers;
    });

    return NextResponse.json({ ok: true, data: { transfers: result, count: result.length } });
  } catch (e: any) {
    const status = e?.message?.includes("غير متوفرة") ? 400 : 500;
    return NextResponse.json({ ok: false, error: { code: "DB_ERROR", message: e?.message || "حدث خطأ أثناء التحويل" } }, { status });
  }
}
