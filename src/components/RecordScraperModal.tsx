"use client";

import { useState } from "react";
import { Copy, Check, Terminal, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/Dialog";
import { Button } from "./ui/Button";
import { toast } from "./ui/Toast";

export const CSSBUY_RECORD_SCRAPER_SCRIPT = `// CSSBuy Balance Record Scraper — todos los movimientos de dinero
// 1. Andá a https://www.cssbuy.com/web/record (o cssbuy.com/shop/cate/record) y logueate
// 2. F12 → Console → Pegá esto → Enter
// 3. Elegí el rango de fechas en los prompts
// 4. Se descarga records.json, subilo en esta página

(async () => {
  const P = 50, M = 5000, A = [];

  let csrf = '';
  try { csrf = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || ''; } catch {}
  if (!csrf) {
    const m = document.documentElement.innerHTML.match(/csrf[_-]?token['"\\s:=]+['"]?([a-zA-Z0-9]+)/i);
    if (m) csrf = m[1];
  }

  let jwtToken = '';
  try {
    jwtToken = localStorage.getItem('css-token') || '';
    if (!jwtToken) {
      const user = JSON.parse(localStorage.getItem('userInfo') || '{}');
      jwtToken = user.token || '';
    }
  } catch {}

  const now = new Date();
  const defEnd = now.toISOString().slice(0, 10);
  const defStart = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString().slice(0, 10);

  const sTime = prompt('Fecha inicio (YYYY-MM-DD):', defStart);
  const eTime = prompt('Fecha fin (YYYY-MM-DD):', defEnd);
  if (!sTime || !eTime) { console.log('Cancelado'); return; }

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'X-Requested-With': 'XMLHttpRequest',
    Accept: 'application/json, text/javascript, */*; q=0.01',
  };
  if (csrf) {
    headers['X-CSRF-Token'] = csrf;
    headers['X-XSRF-TOKEN'] = csrf;
  }
  if (jwtToken) {
    headers['Authorization'] = 'Bearer ' + jwtToken;
    headers['token'] = jwtToken;
    headers['css-token'] = jwtToken;
  }

  let pn = 1, hm = true;
  console.log('🔄 Iniciando descarga de movimientos...');
  while (hm) {
    const params = new URLSearchParams();
    params.set('type', '0');
    params.set('query', '');
    params.set('pageSize', String(P));
    params.set('pageNum', String(pn));
    params.set('sTime', sTime);
    params.set('eTime', eTime);
    if (csrf) params.set('_token', csrf);

    try {
      const res = await fetch('https://www.cssbuy.com/web/record', {
        method: 'POST',
        headers,
        body: params.toString()
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { console.error('No JSON:', text.substring(0, 300)); break; }

      const list = Array.isArray(data?.data) ? data.data : (Array.isArray(data?.list) ? data.list : (Array.isArray(data) ? data : []));
      const total = data?.total || data?.data?.total || list.length;
      for (const it of list) A.push(it);

      console.log('Pág ' + pn + ': ' + list.length + ' movimientos. Acumulado: ' + A.length + '/' + total);
      hm = list.length >= P && A.length < M && (total > 0 ? A.length < total : true);
      if (hm) {
        pn++;
        await new Promise(r => setTimeout(r, 400));
      }
    } catch (err) {
      console.error('Error en pág ' + pn + ':', err);
      break;
    }
  }

  console.log('\\n✅ ' + A.length + ' movimientos descargados con éxito');
  const blob = new Blob([JSON.stringify({ records: A, lastSync: new Date().toISOString(), sTime, eTime, total: A.length }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'records.json';
  a.click();
  URL.revokeObjectURL(url);
  console.log('💾 records.json descargado!');
})();`;

export function RecordScraperModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyScript = async () => {
    try {
      await navigator.clipboard.writeText(CSSBUY_RECORD_SCRAPER_SCRIPT);
      setCopied(true);
      toast.success("Script copiado al portapapeles");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("No se pudo copiar automáticamente");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-[var(--radius)] bg-[var(--color-info-soft)] text-[var(--color-info)] flex items-center justify-center">
              <Terminal className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle>Scraper de CSSBuy Balance Records</DialogTitle>
              <DialogDescription>
                Extrae el historial de transacciones financieras para ver el costo real por orden
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto pr-1">
          <div className="p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius)] border border-[var(--color-border)] text-xs text-[var(--color-fg-muted)] space-y-2">
            <p className="font-semibold text-[var(--color-fg)]">Instrucciones:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>
                Abrí{" "}
                <a
                  href="https://www.cssbuy.com/web/record"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--color-info)] underline inline-flex items-center gap-1"
                >
                  cssbuy.com/web/record <ExternalLink className="h-3 w-3" />
                </a>{" "}
                e iniciá sesión.
              </li>
              <li>Presioná <kbd className="px-1 py-0.5 bg-[var(--color-bg-muted)] rounded font-mono">F12</kbd> (Console).</li>
              <li>Pegá este script y presioná <kbd className="px-1 py-0.5 bg-[var(--color-bg-muted)] rounded font-mono">Enter</kbd>.</li>
              <li>Ingresá el rango de fechas cuando el navegador te lo solicite.</li>
              <li>Se descargará <span className="font-mono font-bold text-[var(--color-fg)]">records.json</span> listo para importar.</li>
            </ol>
          </div>

          <div className="relative">
            <pre className="p-3 bg-[var(--color-bg-inverse)] text-[var(--color-fg-inverse)] rounded-[var(--radius)] font-mono text-[11px] max-h-56 overflow-auto leading-relaxed select-all">
              {CSSBUY_RECORD_SCRAPER_SCRIPT}
            </pre>
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button
            variant="primary"
            icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            onClick={copyScript}
          >
            {copied ? "¡Copiado!" : "Copiar Script"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
