"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Refresh active sessions even when someone spends the day on one screen. */
export function SessionRefresh() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname === "/ingresar") return;
    const controller = new AbortController();
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/auth/get-session", { cache: "no-store", signal: controller.signal });
        if (response.ok && !await response.json()) {
          const destination = window.location.pathname + window.location.search + window.location.hash;
          window.location.replace(`/ingresar?volver=${encodeURIComponent(destination)}`);
        }
      } catch { /* Transient network failures do not discard unsaved work. */ }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10 * 60 * 1000);
    document.addEventListener("visibilitychange", refresh);
    return () => { controller.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [pathname]);
  return null;
}
