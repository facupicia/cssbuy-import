"use client";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export function UnsavedNavigationGuard({ active, guardHistory = false }: { active: boolean; guardHistory?: boolean }) {
  const [destination, setDestination] = useState<string | null>(null);
  const [historyPrompt, setHistoryPrompt] = useState(false);
  const leaving = useRef(false);
  useEffect(() => {
    if (!active || !guardHistory) return;
    const marker = crypto.randomUUID();
    const currentUrl = location.href;
    let restoring = false;
    // A same-URL sentinel lets Back be reviewed before Next.js unmounts the editor.
    history.pushState({ ...history.state, plugUnsaved: marker }, "", currentUrl);
    function back(event: PopStateEvent) {
      if (leaving.current) return;
      event.stopImmediatePropagation();
      if (restoring) { restoring = false; return; }
      restoring = true;
      history.go(1);
      setHistoryPrompt(true);
    }
    window.addEventListener("popstate", back, true);
    return () => {
      window.removeEventListener("popstate", back, true);
      if (!leaving.current && location.href === currentUrl && history.state?.plugUnsaved === marker) {
        // Remove only our own sentinel after saving or cancelling the editor.
        const restored = (event: PopStateEvent) => { event.stopImmediatePropagation(); window.removeEventListener("popstate", restored, true); };
        window.addEventListener("popstate", restored, { capture: true, once: true });
        history.back();
      }
    };
  }, [active, guardHistory]);
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
  return <><ConfirmDialog open={active && destination !== null} onOpenChange={open => { if (!open) setDestination(null); }} title="Salir sin aplicar los cambios" description="Los cambios que preparaste en esta página todavía no se guardaron. Podés seguir editando o salir y descartarlos." confirmText="Descartar y salir" cancelText="Seguir editando" onConfirm={() => { if (destination) { leaving.current = true; window.location.assign(destination); } }} />
    <ConfirmDialog open={active && historyPrompt} onOpenChange={setHistoryPrompt} title="Salir sin guardar el pedido" description="Los cambios del pedido todavía no se guardaron. Podés seguir editando o volver a la página anterior y descartarlos." confirmText="Descartar y volver" cancelText="Seguir editando" onConfirm={() => { leaving.current = true; setHistoryPrompt(false); history.go(-2); }} /></>;
}
