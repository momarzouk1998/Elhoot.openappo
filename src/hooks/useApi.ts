'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

interface ApiState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

// مخزن مؤقت في الذاكرة (داخل الجلسة)
const sessionCache = new Map<string, { data: any; ts: number }>();

// البيانات التحويلية (فواتير، مدفوعات، مخزون) تنتهي بعد 5 ثوانٍ فقط
// البيانات الثابتة (عملاء، موردين، أصناف) تنتهي بعد 30 ثانية
const TRANSACTIONAL_TTL_MS = 5_000;
const STATIC_TTL_MS = 30_000;

const TRANSACTIONAL_PREFIXES = [
  '/api/sales/invoices',
  '/api/purchases/invoices',
  '/api/transfers',
  '/api/payments',
  '/api/treasury',
  '/api/expenses',
  '/api/dashboard',
  '/api/inventory',
  '/api/checks',
];

function getTtl(path: string): number {
  const pathOnly = path.split('?')[0];
  return TRANSACTIONAL_PREFIXES.some(p => pathOnly.startsWith(p))
    ? TRANSACTIONAL_TTL_MS
    : STATIC_TTL_MS;
}

function getCached<T>(path: string): T | null {
  const c = sessionCache.get(path);
  if (!c) return null;
  if (Date.now() - c.ts > getTtl(path)) {
    sessionCache.delete(path);
    return null;
  }
  return c.data as T;
}

function setCached(path: string, data: any) {
  sessionCache.set(path, { data, ts: Date.now() });
}

// خريطة العلاقات: كل مسار API يحدد القوائم اللي ممكن تتأثر بتعديله
// key = prefix المسار اللي اتعدّل، value = قائمة prefixes الكاش اللي لازم تتمسح
const INVALIDATION_MAP: Array<{ match: RegExp; invalidate: string[] }> = [
  // فواتير البيع → تؤثر على: الفواتير، العملاء (الرصيد)، المخزون، الأصناف (آخر سعر/التكلفة)
  { match: /^\/api\/sales\/invoices/, invalidate: ['/api/sales/invoices', '/api/customers', '/api/inventory', '/api/dashboard'] },
  // فواتير الشراء → تؤثر على: المشتريات، الموردين، المخزون، الأصناف، آخر سعر شراء
  { match: /^\/api\/purchases\/invoices/, invalidate: ['/api/purchases/invoices', '/api/suppliers', '/api/inventory', '/api/products', '/api/dashboard'] },
  // تحويلات المخزون → تؤثر على: المخزون، التحويلات
  { match: /^\/api\/transfers/, invalidate: ['/api/transfers', '/api/inventory'] },
  // مدفوعات العملاء → تؤثر على: المدفوعات، العملاء (الرصيد)، الخزائن
  { match: /^\/api\/payments\/customers/, invalidate: ['/api/payments/customers', '/api/customers', '/api/treasury', '/api/dashboard'] },
  // مدفوعات الموردين → تؤثر على: المدفوعات، الموردين (الرصيد)، الخزائن
  { match: /^\/api\/payments\/suppliers/, invalidate: ['/api/payments/suppliers', '/api/suppliers', '/api/treasury', '/api/dashboard'] },
  // العملاء → قائمة العملاء فقط
  { match: /^\/api\/customers/, invalidate: ['/api/customers', '/api/dashboard'] },
  // الموردين → قائمة الموردين فقط
  { match: /^\/api\/suppliers/, invalidate: ['/api/suppliers', '/api/dashboard'] },
  // الأصناف → قائمة الأصناف + المخزون
  { match: /^\/api\/products/, invalidate: ['/api/products', '/api/inventory'] },
  // المخزون → نفسه فقط
  { match: /^\/api\/inventory/, invalidate: ['/api/inventory'] },
  // المخازن → نفسها فقط
  { match: /^\/api\/stores/, invalidate: ['/api/stores'] },
  // الخزائن → نفسها + حركاتها
  { match: /^\/api\/treasury/, invalidate: ['/api/treasury', '/api/dashboard'] },
  // المصروفات → المصروفات + الخزائن
  { match: /^\/api\/expenses/, invalidate: ['/api/expenses', '/api/treasury', '/api/dashboard'] },
  // الشيكات → نفسها
  { match: /^\/api\/checks/, invalidate: ['/api/checks'] },
];

// مسح كاش كل المسارات اللي بتبدأ بأي من الـ prefixes المحددة
// (مثلاً لو عدّلنا عميل /api/customers/123، نمسح كل /api/customers?... )
function invalidateCacheFor(path: string) {
  for (const { match, invalidate } of INVALIDATION_MAP) {
    if (match.test(path)) {
      // امسح كل الـ cache keys اللي تطابق أي من الـ invalidation prefixes
      const keysToDelete: string[] = [];
      for (const k of sessionCache.keys()) {
        // نشيل الـ query string من الـ cache key عشان نقارن الـ path بس
        const cachePathOnly = k.split('?')[0];
        // نفحص لو الـ cache path بيبدأ بأي prefix من الـ invalidate list
        for (const prefix of invalidate) {
          if (cachePathOnly.startsWith(prefix)) {
            keysToDelete.push(k);
            break; // لقينا match، مش محتاجين نفحص باقي الـ prefixes
          }
        }
      }
      // امسح كل الـ keys اللي لقيناها
      for (const k of keysToDelete) {
        sessionCache.delete(k);
      }
      return;
    }
  }
  // fallback: مسح المسار نفسه + أي query variations
  for (const k of sessionCache.keys()) {
    if (k.split('?')[0] === path.split('?')[0]) {
      sessionCache.delete(k);
    }
  }
}

export function useApi<T>(path: string | null) {
  // عرض البيانات المخزنة فوراً (لتجنب وميض "جاري التحميل")
  const initialData = path ? getCached<T>(path) : null;
  const [state, setState] = useState<ApiState<T>>({
    data: initialData,
    loading: !!path && !initialData,
    error: null,
  })
  const abortRef = useRef<AbortController | null>(null)

  const fetchData = useCallback(async (useCache = true) => {
    if (!path) return
    // ✅ لو عندنا بيانات حديثة، اعرضها فوراً واعمل revalidate في الخلفية
    //    (stale-while-revalidate: نعرض الـ cached فوراً، ونحدّث في الخلفية)
    if (useCache) {
      const c = getCached<T>(path);
      if (c) {
        setState({ data: c, loading: false, error: null });
        // ✅ نكمّل الـ fetch في الخلفية بدون spinner (stale-while-revalidate)
      }
    }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    // ✅ لو عندنا data أصلاً، ما نغيرش loading لـ true (عشان مفيش spinner)
    setState((prev) => {
      if (prev.data !== null) return { ...prev, error: null };
      return { ...prev, loading: true, error: null };
    })
    try {
      const res = await fetch(path, { signal: controller.signal, cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        const errObj = json?.error;
        const msg = (typeof errObj === 'string' ? errObj : errObj?.message || errObj?.code) || `HTTP ${res.status}`;
        throw new Error(msg)
      }
      const data = json.data !== undefined ? json.data : json
      if (!controller.signal.aborted) {
        setCached(path, data);
        // ✅ لو البيانات الجديدة مختلفة عن اللي معروضة، حدّث الـ state
        setState((prev) => {
          // قارن كـ JSON عشان نتجنب re-render لو البيانات نفسها
          const sameData = JSON.stringify(prev.data) === JSON.stringify(data);
          if (sameData) {
            return { data, loading: false, error: null };
          }
          return { data, loading: false, error: null };
        })
      }
      return data
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return null
      const message = err instanceof Error ? err.message : 'حدث خطأ'
      if (!controller.signal.aborted) {
        setState((prev) => ({ ...prev, loading: false, error: message }))
      }
      return null
    }
  }, [path])

  useEffect(() => {
    if (path) fetchData()
    return () => { abortRef.current?.abort() }
  }, [fetchData, path])

  // ✅ Polling ذكي: نعمل refetch لما الصفحة تاخد focus أو ترجع visible
  //    ده بيخلي الفواتير الجديدة تظهر بدون refresh يدوي
  useEffect(() => {
    if (!path) return

    let pollTimer: ReturnType<typeof setInterval> | null = null
    let isMounted = true

    function startPolling() {
      if (pollTimer) return
      // كل 15 ثانية نعمل refetch صامت (silent)
      pollTimer = setInterval(() => {
        if (!isMounted) return
        if (document.visibilityState === 'visible') {
          fetchData(false) // useCache=false عشان نضمن fetch حقيقي
        }
      }, 15_000)
    }

    function stopPolling() {
      if (pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        // ✅ اليوزر رجع للتب → refetch فوري
        fetchData(false)
        startPolling()
      } else {
        stopPolling()
      }
    }

    function handleFocus() {
      // ✅ اليوزر عمل focus على النافذة (click مثلاً) → refetch
      if (document.visibilityState === 'visible') {
        fetchData(false)
      }
    }

    // ابدأ الـ polling لو الصفحة visible
    if (document.visibilityState === 'visible') {
      startPolling()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)

    return () => {
      isMounted = false
      stopPolling()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [path, fetchData])

  return { ...state, refetch: () => fetchData(false) }
}

export function useApiMutation() {
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const mutate = useCallback(async <T = any>(method: string, path: string, body?: unknown): Promise<{ error: string | null; data: T | null }> => {
    // عند POST/PATCH/DELETE: نمسح كاش المسارات المرتبطة بذكاء
    if (method !== 'GET') {
      invalidateCacheFor(path);
    }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    try {
      const res = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        const errObj = json?.error;
        const msg = (typeof errObj === 'string' ? errObj : errObj?.message || errObj?.code) || `HTTP ${res.status}`;
        return { error: msg, data: null }
      }
      return { error: null, data: json.data !== undefined ? json.data : json }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return { error: null, data: null }
      const message = err instanceof Error ? err.message : 'حدث خطأ'
      return { error: message, data: null }
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [])
  return { mutate, loading }
}
