"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SupplierReturnsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/purchases?tab=returns"); }, [router]);
  return null;
}
