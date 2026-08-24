"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUserClient } from "@/hooks/useCurrentUser";
import { useApiMutation } from "@/hooks/useApi";

interface CurrentProfile {
  id: number;
  username: string;
  full_name: string;
  role: string;
  can_see_cost: boolean;
  is_active: boolean;
}

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<CurrentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const { mutate, loading: saving } = useApiMutation();

  useEffect(() => {
    getCurrentUserClient().then((p) => {
      setProfile(p);
      setLoading(false);
    });
  }, []);

  async function handleChangePassword() {
    if (!oldPassword || !newPassword || !confirmPassword) {
      alert("❌ يرجى ملء جميع الحقول");
      return;
    }
    if (newPassword !== confirmPassword) {
      alert("❌ كلمة المرور الجديدة غير متطابقة");
      return;
    }
    if (newPassword.length < 4) {
      alert("❌ كلمة المرور يجب أن تكون 4 أحرف على الأقل");
      return;
    }

    const { error } = await mutate("PATCH", "/api/auth/change-password", {
      old_password: oldPassword,
      new_password: newPassword,
    });

    if (error) {
      alert("❌ " + error);
      return;
    }

    alert("✅ تم تغيير كلمة المرور بنجاح");
    setOldPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  if (loading) {
    return <div className="card py-12 text-center text-gray-500">⏳ جاري التحميل...</div>;
  }

  if (!profile) {
    return <div className="card py-12 text-center text-gray-500">❌ لم يتم العثور على بيانات المستخدم</div>;
  }

  return (
    <div className="space-y-6">
      {/* رأس الصفحة */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-650">👤 الملف الشخصي</h1>
          <p className="text-sm text-gray-500">إدارة حسابك وتغيير كلمة المرور</p>
        </div>
        <button onClick={() => router.back()} className="btn-secondary">
          ↩️ العودة
        </button>
      </div>

      {/* بيانات المستخدم */}
      <div className="card">
        <h2 className="text-lg font-bold mb-4">📋 بيانات المستخدم</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">الاسم الكامل</p>
            <p className="font-semibold text-lg">{profile.full_name}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">اسم المستخدم</p>
            <p className="font-semibold font-mono">{profile.username}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">الدور الوظيفي</p>
            <p className="font-semibold">
              {profile.role === "admin" && "مدير عام"}
              {profile.role === "manager" && "مدير"}
              {profile.role === "accountant" && "محاسب"}
              {profile.role === "rep" && "مندوب"}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">الحالة</p>
            <p className="font-semibold">
              {profile.is_active ? (
                <span className="text-green-700">✅ نشط</span>
              ) : (
                <span className="text-red-700">⛔ غير نشط</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* تغيير كلمة المرور */}
      <div className="card">
        <h2 className="text-lg font-bold mb-4">🔐 تغيير كلمة المرور</h2>
        <div className="space-y-4 max-w-md">
          <div>
            <label className="text-sm font-medium block mb-1">كلمة المرور الحالية *</label>
            <input
              type="password"
              className="input-field"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="أدخل كلمة المرور الحالية"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">كلمة المرور الجديدة *</label>
            <input
              type="password"
              className="input-field"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="أدخل كلمة المرور الجديدة"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">تأكيد كلمة المرور الجديدة *</label>
            <input
              type="password"
              className="input-field"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="أعد إدخال كلمة المرور الجديدة"
            />
          </div>
          <button
            onClick={handleChangePassword}
            disabled={saving}
            className="btn-primary w-full"
          >
            {saving ? "⏳ جاري الحفظ..." : "💾 تغيير كلمة المرور"}
          </button>
        </div>
      </div>
    </div>
  );
}
