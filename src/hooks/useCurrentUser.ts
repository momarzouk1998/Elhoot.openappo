'use client';
import { useState, useEffect } from 'react';

interface CurrentProfile {
  id: number;
  username: string;
  full_name: string;
  role: string;
  can_see_cost: boolean;
  is_active: boolean;
}

let cached: CurrentProfile | null = null;

export async function getCurrentUserClient(): Promise<CurrentProfile | null> {
  if (cached) return cached;
  try {
    const res = await fetch('/api/auth/user');
    if (!res.ok) return null;
    const json = await res.json();
    cached = json.data;
    return cached;
  } catch {
    return null;
  }
}

export function useCurrentUser() {
  const [profile, setProfile] = useState<CurrentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    getCurrentUserClient().then(p => { setProfile(p); setLoading(false); });
  }, []);
  return { profile, loading };
}
