import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-server";
import Sidebar from "@/components/Sidebar";

// Force all pages in this layout to be dynamic (no static generation at build time)
// This prevents next build from trying to connect to the DB during CI/Docker builds
export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentUser();
  if (!profile) redirect('/login');

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar profile={profile} />
      {/*
        على الموبايل: pt-14 لتفادي الـ top bar الثابت.
        على الديسكتوب: pt-0 (الـ sidebar جنبي).
        max-w-full + overflow-x-hidden لمنع الانزلاق الأفقي في الجوال.
      */}
      <main className="flex-1 min-w-0 max-w-full p-3 pt-16 md:p-6 md:pt-6 overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
