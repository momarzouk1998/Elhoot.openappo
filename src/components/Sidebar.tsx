"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ALL_MODULES, canSeeModule, type CurrentProfile, ROLE_LABELS } from "@/lib/auth";
import Image from "next/image";

export default function Sidebar({ profile }: { profile: CurrentProfile }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // أغلق الـ drawer عند تغيير الصفحة
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // قفل/فتح scroll الـ body عند فتح الـ drawer
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // إغلاق بـ ESC
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  function handleInstallApp() {
    if ('serviceWorker' in navigator && 'BeforeInstallPromptEvent' in window) {
      // @ts-ignore
      const deferredPrompt = window.deferredPrompt;
      if (deferredPrompt) {
        deferredPrompt.prompt();
      } else {
        alert('📱 التطبيق مثبّت بالفعل أو متاح للتثبيت من إعدادات المتصفح');
      }
    } else {
      alert('📱 يمكنك تثبيت التطبيق من إعدادات المتصفح (المزيد > تثبيت التطبيق)');
    }
  }

  const visible = ALL_MODULES.filter(m => canSeeModule(profile, m.key));

  return (
    <>
      {/* ====== Mobile top bar ====== */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-40 bg-header-gradient text-white px-3 py-2.5 flex items-center justify-between shadow-lg safe-area-top">
        <button
          onClick={() => setOpen(!open)}
          className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/10 text-2xl shrink-0 order-1"
          aria-label={open ? "إغلاق القائمة" : "فتح القائمة"}
        >
          {open ? '✕' : '☰'}
        </button>
        <div className="flex items-center gap-2 min-w-0 order-2">
          <div className="w-9 h-9 rounded-lg bg-white p-0.5 border-2 border-amber-500 shrink-0">
            <Image src="/logo.png" alt="شركة الحوت" width={32} height={32} className="rounded object-contain" />
          </div>
          <div className="font-bold text-sm truncate">شركة الحوت للأدوات الكهربائية</div>
        </div>
      </header>

      {/* ====== Mobile drawer (overlay) ====== */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            className="absolute right-0 top-0 h-full w-[280px] max-w-[85vw] bg-header-gradient text-white shadow-2xl flex flex-col animate-slide-in"
          >
            <div className="flex items-center justify-between p-3 border-b border-white/10">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-white p-0.5 border-2 border-amber-500 shrink-0">
                  <Image src="/logo.png" alt="شركة الحوت" width={36} height={36} className="rounded object-contain" />
                </div>
                <div className="min-w-0">
                  <div className="font-extrabold text-sm leading-tight truncate">شركة الحوت</div>
                  <div className="text-[10px] text-blue-200 font-medium truncate">{profile.full_name} • {ROLE_LABELS[profile.role]}</div>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/10 text-xl"
                aria-label="إغلاق"
              >✕</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <SidebarContent visible={visible} pathname={pathname} onNavigate={() => setOpen(false)} />
            </div>
            <div className="p-3 border-t border-white/10 flex items-center gap-2">
              <Link
                href="/profile"
                onClick={() => setOpen(false)}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all shrink-0 flex items-center gap-1"
                title="الملف الشخصي"
              >
                <span>👤</span>
              </Link>
              <button
                onClick={handleInstallApp}
                className="flex-1 py-2 px-2.5 flex items-center justify-center gap-1 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/30 text-amber-200 text-xs font-bold transition-all cursor-pointer truncate"
                title="تثبيت التطبيق"
              >
                <span>📱 تثبيت</span>
              </button>
              <button
                onClick={logout}
                className="py-2 px-2.5 flex items-center justify-center gap-1 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-400/30 text-red-200 text-xs font-bold transition-all cursor-pointer shrink-0"
                title="تسجيل الخروج"
              >
                <span>🚪 خروج</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ====== Desktop sidebar ====== */}
      <aside className="hidden md:flex flex-col w-64 bg-header-gradient text-white h-screen sticky top-0 shadow-2xl shrink-0">
        <SidebarContent visible={visible} pathname={pathname} onNavigate={() => {}} profile={profile} />
        <div className="p-3 border-t border-white/10 flex items-center gap-2">
          <Link
            href="/profile"
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all shrink-0 flex items-center gap-1"
            title="الملف الشخصي"
          >
            <span>👤</span>
          </Link>
          <button
            onClick={handleInstallApp}
            className="flex-1 py-2 px-2.5 flex items-center justify-center gap-1 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/30 text-amber-200 text-xs font-bold transition-all cursor-pointer truncate"
            title="تثبيت التطبيق"
          >
            <span>📱 تثبيت</span>
          </button>
          <button
            onClick={logout}
            className="py-2 px-2.5 flex items-center justify-center gap-1 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-400/30 text-red-200 text-xs font-bold transition-all cursor-pointer shrink-0"
            title="تسجيل الخروج"
          >
            <span>🚪 خروج</span>
          </button>
        </div>
      </aside>
    </>
  );
}

function SidebarContent({ visible, pathname, onNavigate, profile }: { visible: any[]; pathname: string; onNavigate: () => void; profile?: CurrentProfile }) {
  const activeModule = visible.reduce<any | null>((best, module) => {
    if (!module.path) return best;
    if (pathname === module.path) return module;
    if (pathname.startsWith(`${module.path}/`)) {
      if (!best || module.path.length > best.path.length) return module;
    }
    return best;
  }, null);

  return (
    <>
      <div className="p-4 border-b-4 border-amber-500 flex items-center gap-3 hidden md:flex">
        <div className="w-12 h-12 rounded-lg bg-white p-0.5 border-2 border-amber-500 shrink-0">
          <Image src="/logo.png" alt="شركة الحوت" width={44} height={44} className="rounded object-contain" />
        </div>
        <div className="min-w-0">
          <div className="font-extrabold text-base leading-tight">شركة الحوت</div>
          <div className="text-[11px] text-amber-300 font-medium truncate">
            {profile ? `${profile.full_name} • ${ROLE_LABELS[profile.role]}` : 'للأدوات الكهربائية'}
          </div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        {visible.map((m) => {
          const active = activeModule?.key === m.key;
          return (
            <Link
              key={m.key}
              href={m.path}
              onClick={onNavigate}
              prefetch={true}
              className={`flex items-center gap-3 px-4 py-3 mx-2 my-0.5 rounded-lg text-sm transition-all ${
                active
                  ? 'bg-amber-500 text-slate-900 shadow-md font-bold'
                  : 'text-gray-200 hover:bg-white/10 hover:text-white active:bg-white/5'
              }`}
            >
              <span className="text-lg shrink-0">{m.icon}</span>
              <span className="truncate">{m.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
