import prisma from "@/lib/db/prisma";

interface AuditLogEntry {
  userId: number;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  tableName: string;
  rowId: string;
  beforeData?: Record<string, any>;
  afterData?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

export async function createAuditLog(entry: AuditLogEntry) {
  try {
    await prisma.audit_log.create({
      data: {
        user_id: entry.userId,
        action: entry.action,
        table_name: entry.tableName,
        row_id: entry.rowId,
        before_json: entry.beforeData || null,
        after_json: entry.afterData || null,
        created_at: new Date(),
      },
    });
  } catch (e) {
    console.error('فشل في إنشاء سجل التدقيق:', e);
  }
}

// دوال مساعدة للعمليات المالية المختلفة
export const AuditLog = {
  customerPaymentCreated: async (userId: number, paymentId: string, paymentData: any) => {
    await createAuditLog({
      userId,
      action: 'INSERT',
      tableName: 'customer_payments',
      rowId: paymentId,
      afterData: paymentData,
    });
  },

  customerPaymentUpdated: async (userId: number, paymentId: string, beforeData: any, afterData: any) => {
    await createAuditLog({
      userId,
      action: 'UPDATE',
      tableName: 'customer_payments',
      rowId: paymentId,
      beforeData,
      afterData,
    });
  },

  customerPaymentDeleted: async (userId: number, paymentId: string, paymentData: any) => {
    await createAuditLog({
      userId,
      action: 'DELETE',
      tableName: 'customer_payments',
      rowId: paymentId,
      beforeData: paymentData,
    });
  },

  supplierPaymentCreated: async (userId: number, paymentId: string, paymentData: any) => {
    await createAuditLog({
      userId,
      action: 'INSERT',
      tableName: 'supplier_payments',
      rowId: paymentId,
      afterData: paymentData,
    });
  },

  supplierPaymentDeleted: async (userId: number, paymentId: string, paymentData: any) => {
    await createAuditLog({
      userId,
      action: 'DELETE',
      tableName: 'supplier_payments',
      rowId: paymentId,
      beforeData: paymentData,
    });
  },

  expenseCreated: async (userId: number, expenseId: string, expenseData: any) => {
    await createAuditLog({
      userId,
      action: 'INSERT',
      tableName: 'expenses',
      rowId: expenseId,
      afterData: expenseData,
    });
  },

  expenseDeleted: async (userId: number, expenseId: string, expenseData: any) => {
    await createAuditLog({
      userId,
      action: 'DELETE',
      tableName: 'expenses',
      rowId: expenseId,
      beforeData: expenseData,
    });
  },

  treasuryTransfer: async (userId: number, transferId: string, transferData: any) => {
    await createAuditLog({
      userId,
      action: 'INSERT',
      tableName: 'treasury_transactions',
      rowId: transferId,
      afterData: transferData,
    });
  },
};