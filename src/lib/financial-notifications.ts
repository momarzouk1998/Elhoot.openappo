// نظام إشعارات بسيط للعمليات المالية المهمة
import prisma from "@/lib/db/prisma";

interface NotificationData {
  type: 'payment_deleted' | 'large_expense' | 'treasury_transfer' | 'negative_balance';
  title: string;
  description: string;
  amount?: number;
  userId: number;
  relatedId?: string;
}

export async function createFinancialNotification(data: NotificationData) {
  try {
    // في المستقبل يمكن حفظها في جدول notifications
    // الآن نستخدم console.log للمراقبة
    console.log(`[مالية] ${data.type}: ${data.title}`, {
      description: data.description,
      amount: data.amount,
      userId: data.userId,
      relatedId: data.relatedId,
      timestamp: new Date().toISOString(),
    });

    // يمكن إضافة إرسال إيميل أو رسائل للإداريين هنا
    if (shouldNotifyAdmins(data)) {
      await notifyAdmins(data);
    }
  } catch (e) {
    console.error('فشل في إنشاء الإشعار المالي:', e);
  }
}

function shouldNotifyAdmins(data: NotificationData): boolean {
  // إشعار الإداريين في الحالات الحرجة
  return (
    data.type === 'payment_deleted' || 
    (data.type === 'large_expense' && (data.amount || 0) > 5000) ||
    data.type === 'negative_balance'
  );
}

async function notifyAdmins(data: NotificationData) {
  try {
    // جلب الإداريين
    const admins = await prisma.users.findMany({
      where: { role: 'admin', is_active: true },
      select: { id: true, full_name: true, email: true }
    });

    // في المستقبل يمكن إرسال إيميلات أو رسائل واتساب
    console.log(`[إشعار للإداريين] ${data.title}`, {
      admins: admins.map(a => a.full_name),
      data: data
    });
  } catch (e) {
    console.error('فشل في إشعار الإداريين:', e);
  }
}

// دوال مساعدة للأنواع المختلفة من الإشعارات
export const FinancialNotifications = {
  paymentDeleted: (amount: number, customerName: string, deletedBy: number) =>
    createFinancialNotification({
      type: 'payment_deleted',
      title: 'تم حذف مدفوعة',
      description: `تم حذف مدفوعة بمبلغ ${amount} ج من العميل ${customerName}`,
      amount,
      userId: deletedBy,
    }),

  largeExpense: (amount: number, description: string, createdBy: number) =>
    createFinancialNotification({
      type: 'large_expense',
      title: 'مصروف كبير',
      description: `تم إنشاء مصروف بمبلغ ${amount} ج: ${description}`,
      amount,
      userId: createdBy,
    }),

  treasuryTransfer: (amount: number, fromTreasury: string, toTreasury: string, transferredBy: number) =>
    createFinancialNotification({
      type: 'treasury_transfer',
      title: 'تحويل بين الخزائن',
      description: `تم تحويل ${amount} ج من ${fromTreasury} إلى ${toTreasury}`,
      amount,
      userId: transferredBy,
    }),

  negativeBalance: (treasuryName: string, balance: number) =>
    createFinancialNotification({
      type: 'negative_balance',
      title: 'رصيد سالب في خزينة',
      description: `خزينة ${treasuryName} أصبح رصيدها ${balance} ج`,
      amount: balance,
      userId: 0, // نظام
    }),
};