// Common formatters & helpers

export function formatEGP(n: number | string | null | undefined): string {
  if (n === null || n === undefined) return '0';
  const num = typeof n === 'string' ? parseFloat(n) : n;
  if (isNaN(num)) return '0';
  // Show decimals only if there's a non-zero fractional part
  const hasDecimals = num % 1 !== 0;
  return num.toLocaleString('en-US', { 
    minimumFractionDigits: hasDecimals ? 2 : 0, 
    maximumFractionDigits: 2 
  });
}

export function formatQty(n: number | string | null | undefined): string {
  if (n === null || n === undefined) return '0';
  const num = typeof n === 'string' ? parseFloat(n) : n;
  if (isNaN(num)) return '0';
  // Show decimals only if there's a non-zero fractional part
  const hasDecimals = num % 1 !== 0;
  return num.toLocaleString('en-US', { 
    minimumFractionDigits: hasDecimals ? 2 : 0, 
    maximumFractionDigits: 2 
  });
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function daysAgo(d: Date | string): number {
  const date = typeof d === 'string' ? new Date(d) : d;
  const diff = Date.now() - date.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function statusColor(status: string): string {
  switch (status) {
    case 'مكتملة': return 'bg-green-100 text-green-800 border-green-200';
    case 'قيد التنفيذ': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'ملغاة': return 'bg-red-100 text-red-800 border-red-200';
    case 'لم يتم السداد': return 'bg-red-100 text-red-800 border-red-200';
    case 'مدفوعات زائدة': return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'حساب خالص': return 'bg-green-100 text-green-800 border-green-200';
    case 'تحت التحصيل': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'تم الصرف': return 'bg-green-100 text-green-800 border-green-200';
    case 'مرفوض': return 'bg-red-100 text-red-800 border-red-200';
    default: return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}

export function getDayName(date: Date = new Date()): string {
  const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  return days[date.getDay()];
}

export const PAYMENT_METHODS = [
  { value: 'نقدي', label: 'نقدي', icon: '💵' },
  { value: 'إنستاباي', label: 'إنستاباي', icon: '📱' },
  { value: 'فودافون كاش', label: 'فودافون كاش', icon: '📞' },
  { value: 'شيك', label: 'شيك', icon: '🧾' },
  { value: 'تحويل بنكي', label: 'تحويل بنكي', icon: '🏦' },
];

export const EXPENSE_CATEGORIES = [
  'إيجار', 'كهرباء', 'مياه', 'مرتبات', 'عمولة مندوب',
  'سلف', 'صيانة', 'مواصلات', 'تسويق', 'متنوعة', 'أخرى',
];

// Arabic normalization helper for resilient search (لمبة/لمبه, الترا/ألترا, etc.)
export function normalizeArabic(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[\u064B-\u0652\u0670]/g, '') // Remove tashkeel & dagger alif
    .replace(/[ـ\-_]/g, '') // Remove tatweel & hyphens
    .replace(/\s+/g, ' ')
    .trim();
}

// Tokenized search: all query words must match somewhere in target
export function matchesArabicSearch(target: string | null | undefined, query: string | null | undefined): boolean {
  if (!query || !query.trim()) return true;
  if (!target) return false;
  const normTarget = normalizeArabic(target);
  const normQuery = normalizeArabic(query);
  const words = normQuery.split(' ').filter(Boolean);
  return words.every(w => normTarget.includes(w));
}
