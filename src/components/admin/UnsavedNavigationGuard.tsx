"use client";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export function UnsavedNavigationGuard({ active }: { active: boolean }) {
  const [destination, setDestination] = useState<string | null>(null);
  const leaving = useRef(false);
  useEffect(() => {
    if (!active) return;
    function unload(event: BeforeUnloadEvent) { if (!leaving.current) event.preventDefault(); }
    function navigate(event: MouseEvent) {
      if (leaving.current || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href);
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      event.preventDefault(); event.stopPropagation(); setDestination(link.href);
    }
    window.addEventListener("beforeunload", unload); document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigate, true); };
  }, [active]);
  return <ConfirmDialog open={active && destination !== null} onOpenChange={open => { if (!open) setDestination(null); }} title="Salir sin aplicar los cambios" description="Los cambios que preparaste en esta página todavía no se guardaron. Podés seguir editando o salir y descartarlos." confirmText="Descartar y salir" cancelText="Seguir editando" onConfirm={() => { if (destination) { leaving.current = true; window.location.assign(destination); } }} />;
}
