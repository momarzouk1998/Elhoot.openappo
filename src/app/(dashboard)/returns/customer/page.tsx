"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CustomerReturnsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/sales?tab=returns"); }, [router]);
  return null;
}
