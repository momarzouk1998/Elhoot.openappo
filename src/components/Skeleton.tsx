// ========================================
// مكونات Skeleton مشتركة - لعرض محتوى فوري أثناء التحميل
// ========================================

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="card overflow-hidden p-0">
      <div className="bg-gray-50 p-3 h-12 animate-pulse"></div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="border-t p-3 flex gap-3">
          {Array.from({ length: cols }).map((_, j) => (
            <div key={j} className="h-4 bg-gray-200 rounded animate-pulse flex-1"></div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-3"></div>
          <div className="h-8 bg-gray-200 rounded w-3/4"></div>
        </div>
      ))}
    </div>
  );
}

export function FormSkeleton() {
  return (
    <div className="card animate-pulse space-y-3">
      <div className="h-6 bg-gray-200 rounded w-1/3"></div>
      <div className="h-10 bg-gray-200 rounded"></div>
      <div className="h-10 bg-gray-200 rounded"></div>
      <div className="h-10 bg-gray-200 rounded w-1/2"></div>
    </div>
  );
}

export function PageHeaderSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-8 bg-gray-200 rounded w-1/3 mb-2"></div>
      <div className="h-4 bg-gray-200 rounded w-1/4"></div>
    </div>
  );
}

// Skeleton شامل لصفحة جدول كامل (header + filters + table + cards)
export function ListPageSkeleton() {
  return (
    <div className="space-y-4">
      <PageHeaderSkeleton />
      <CardSkeleton count={2} />
      <div className="h-12 bg-gray-200 rounded animate-pulse"></div>
      <TableSkeleton rows={8} cols={6} />
    </div>
  );
}

// Skeleton موبايل: كاردات بدل جدول
export function MobileCardsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-2 sm:hidden">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card animate-pulse p-3">
          <div className="flex justify-between mb-2">
            <div className="h-4 bg-gray-200 rounded w-1/3"></div>
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          </div>
          <div className="h-3 bg-gray-200 rounded w-2/3 mb-1"></div>
          <div className="h-3 bg-gray-200 rounded w-1/2"></div>
        </div>
      ))}
    </div>
  );
}
