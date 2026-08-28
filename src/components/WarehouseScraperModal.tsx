"use client";

import { useState } from "react";
import { Copy, Check, Terminal, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/Dialog";
import { Button } from "./ui/Button";
import { toast } from "./ui/Toast";

export const CSSBUY_WAREHOUSE_SCRAPER_SCRIPT = `// CSSBuy Orders Scraper — Extrae todos tus pedidos válidos dentro de un rango de fechas
// 1. Andá a https://www.cssbuy.com/shop/cate/order (o cssbuy.com/web/order) y logueate
// 2. F12 → Console → Pegá este script → Enter
// 3. Elegí el rango de fechas en los prompts
// 4. Se descargará orders.json con todas tus órdenes válidas (excluyendo canceladas/inválidas)

(async () => {
  const P = 50, M = 2000, A = [];

  function peso(w) {
    if (!w) return 0;
    if (typeof w === 'number') return w;
    try {
      const p = JSON.parse(String(w));
      return Array.isArray(p) ? (Number(p[0]) || 0) : (Number(w) || 0);
    } catch {
      return Number(String(w).match(/\\d+/)?.[0]) || 0;
    }
  }

  function cleanStr(v) {
    return v == null ? '' : String(v).trim();
  }

  function pick(it, keys) {
    if (!it || typeof it !== 'object') return undefined;
    for (const k of keys) {
      if (it[k] != null && String(it[k]).trim() !== '') return it[k];
    }
    return undefined;
  }

  function isInvalidOrder(it, parent) {
    if (!it) return true;
    const p = parent || {};
    const stateVal = pick(it, ['state', 'status', 'orderState', 'order_state', 'goods_status', 'goodsstatus', 'order_status', 'orderStatus', 'pay_status', 'paystatus', 'cancel_status', 'cancelStatus', 'refund_status', 'refundStatus']) ??
                     pick(p, ['state', 'status', 'orderState', 'order_state', 'goods_status', 'goodsstatus', 'order_status', 'orderStatus', 'pay_status', 'paystatus', 'cancel_status', 'cancelStatus', 'refund_status', 'refundStatus']);
    const stateStr = String(stateVal ?? '').trim();
    if (stateStr === '0' || stateStr === '-1' || stateStr === '7' || stateStr === '8' || stateStr === '9' || stateStr === '10') return true;

    const isDel = pick(it, ['is_del', 'isdel', 'is_delete', 'deleted']) ?? pick(p, ['is_del', 'isdel', 'is_delete', 'deleted']);
    if (String(isDel) === '1' || String(isDel) === 'true') return true;

    const cancelStatus = pick(it, ['cancel_status', 'cancelStatus']) ?? pick(p, ['cancel_status', 'cancelStatus']);
    if (String(cancelStatus) === '1' || String(cancelStatus) === '2') return true;

    const refundStatus = pick(it, ['refund_status', 'refundStatus']) ?? pick(p, ['refund_status', 'refundStatus']);
    if (String(refundStatus) === '1' || String(refundStatus) === '2') return true;

    const stateName = cleanStr(
      pick(it, ['statename', 'status_name', 'statusName', 'state_name', 'stateName', 'status', 'state', 'orderState', 'order_state', 'remark']) ??
      pick(p, ['statename', 'status_name', 'statusName', 'state_name', 'stateName', 'status', 'state', 'orderState', 'order_state', 'remark'])
    ).toLowerCase();

    if (
      !stateName ||
      stateName === '0' ||
      stateName === '-1' ||
      stateName === '7' ||
      stateName === '8' ||
      stateName === '9' ||
      stateName === '10' ||
      stateName.includes('invalid') ||
      stateName.includes('inválid') ||
      stateName.includes('invalida') ||
      stateName.includes('invalido') ||
      stateName.includes('cancel') ||
      stateName.includes('cancelled') ||
      stateName.includes('canceled') ||
      stateName.includes('cancelado') ||
      stateName.includes('cancelada') ||
      stateName.includes('refund') ||
      stateName.includes('refunded') ||
      stateName.includes('reembols') ||
      stateName.includes('return') ||
      stateName.includes('returned') ||
      stateName.includes('devuelto') ||
      stateName.includes('devoluc') ||
      stateName.includes('close') ||
      stateName.includes('closed') ||
      stateName.includes('cerrado') ||
      stateName.includes('cerrada') ||
      stateName.includes('reject') ||
      stateName.includes('unpaid') ||
      stateName.includes('non-payment') ||
      stateName.includes('out of stock') ||
      stateName.includes('sin stock') ||
      stateName.includes('agotado') ||
      stateName.includes('expired') ||
      stateName.includes('fail') ||
      stateName.includes('problem') ||
      stateName.includes('after sales') ||
      stateName.includes('after-sales') ||
      stateName.includes('无效') ||
      stateName.includes('已取消') ||
      stateName.includes('取消') ||
      stateName.includes('退款') ||
      stateName.includes('已退款') ||
      stateName.includes('退货') ||
      stateName.includes('已退货') ||
      stateName.includes('关闭') ||
      stateName.includes('已关闭') ||
      stateName.includes('失效') ||
      stateName.includes('已失效') ||
      stateName.includes('缺货') ||
      stateName.includes('未付款') ||
      stateName.includes('异常') ||
      stateName.includes('删除') ||
      stateName.includes('拒绝') ||
      stateName.includes('失败')
    ) {
      return true;
    }
    return false;
  }

  function mapSingle(it, parent) {
    const p = parent || {};
    const oid = cleanStr(pick(it, ['oid', 'order_sn', 'orderSn', 'order_no', 'orderid', 'order_id', 'id']) ?? pick(p, ['oid', 'order_sn', 'orderSn', 'order_no', 'orderid', 'order_id', 'id']));
    const producto = cleanStr(pick(it, ['goodsname', 'goods_name', 'title', 'name', 'order_title', 'product_name', 'remark']) ?? pick(p, ['goodsname', 'goods_name', 'title', 'name', 'order_title', 'product_name']));
    const imagen = cleanStr(pick(it, ['goodsimg', 'goods_img', 'skuimg', 'sku_img', 'image', 'pic', 'pic_url', 'goods_picture']) ?? pick(p, ['goodsimg', 'goods_img', 'skuimg', 'sku_img', 'image', 'pic']));
    const url = cleanStr(pick(it, ['goodsurl', 'goods_url', 'url', 'product_url', 'item_url', 'link']) ?? pick(p, ['goodsurl', 'goods_url', 'url', 'product_url', 'item_url']));
    const vendedor = cleanStr(pick(it, ['goodsseller', 'goods_seller', 'seller', 'shop_name', 'seller_name']) ?? pick(p, ['goodsseller', 'goods_seller', 'seller']));
    const variante = cleanStr(pick(it, ['goodssize', 'goods_size', 'size', 'variant', 'sku_name', 'sku', 'spec', 'goods_spec']) ?? '');
    const precio = Number(pick(it, ['goodsprice', 'goods_price', 'price', 'unit_price', 'totalmoney', 'money']) ?? pick(p, ['goodsprice', 'goods_price', 'price', 'totalmoney', 'money'])) || 0;
    const envioLocal = Number(pick(it, ['sendprice', 'send_price', 'freight', 'domestic_freight', 'chinashipping']) ?? pick(p, ['sendprice', 'send_price', 'freight'])) || 0;
    const envioChina = Number(pick(it, ['chinashipping', 'sendprice', 'send_price']) ?? pick(p, ['chinashipping'])) || 0;
    const cantidad = Math.max(1, Math.round(Number(pick(it, ['goodsnum', 'goods_num', 'quantity', 'num', 'count', 'amount']) ?? pick(p, ['goodsnum', 'goods_num', 'quantity'])) || 1));
    const estado = cleanStr(pick(it, ['statename', 'status_name', 'statusName', 'state_name', 'stateName', 'status', 'state']) ?? pick(p, ['statename', 'status_name', 'state_name', 'status', 'state']));
    const pesoG = peso(pick(it, ['orderweight', 'order_weight', 'weight', 'weight_g', 'actual_weight']) ?? pick(p, ['orderweight', 'order_weight', 'weight']));
    const tracking = cleanStr(pick(it, ['expressno', 'express_no', 'tracking', 'tracking_no', 'trackno', 'logisticsno', 'deliveryno']) ?? pick(p, ['expressno', 'tracking']));
    const rawDate = pick(it, ['addtime', 'add_time', 'createtime', 'create_time', 'ctime', 'order_time', 'paytime']) ?? pick(p, ['addtime', 'add_time', 'createtime']);
    const fecha = Number(rawDate) ? (Number(rawDate) > 1e12 ? Math.floor(Number(rawDate) / 1000) : Number(rawDate)) : Math.floor(Date.now() / 1000);

    return {
      oid: oid || ('gen-' + Math.random().toString(36).slice(2, 9)),
      producto: producto || (oid ? 'Pedido #' + oid : 'Producto sin nombre'),
      imagen,
      url,
      vendedor,
      variante,
      precio_unitario_cny: precio,
      envio_local_cny: envioLocal,
      envio_china_cny: envioChina,
      cantidad,
      estado: estado || 'Procesando',
      peso_g: pesoG,
      tracking,
      fecha_pedido: fecha,
    };
  }

  function extractItems(it) {
    if (!it || typeof it !== 'object') return [];
    const subList = it.goods_list || it.goods || it.items || it.order_goods || it.order_items || it.child_orders || it.detail_list;
    if (Array.isArray(subList) && subList.length > 0) {
      return subList.map(sub => mapSingle(sub, it));
    }
    return [mapSingle(it, null)];
  }

  const now = new Date();
  const defEnd = now.toISOString().slice(0, 10);
  const defStart = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString().slice(0, 10);

  const sTime = prompt('Fecha inicio (YYYY-MM-DD):', defStart);
  const eTime = prompt('Fecha fin (YYYY-MM-DD):', defEnd);
  if (!sTime || !eTime) { console.log('❌ Operación cancelada por el usuario'); return; }

  const startTs = new Date(sTime + 'T00:00:00Z').getTime() - (24 * 3600 * 1000);
  const endTs = new Date(eTime + 'T23:59:59Z').getTime() + (24 * 3600 * 1000);

  function isInDateRange(fechaSegundos) {
    if (!fechaSegundos) return true;
    const ts = fechaSegundos * 1000;
    return ts >= startTs && ts <= endTs;
  }

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
  console.log(\`🔄 Iniciando extracción de órdenes desde \${sTime} hasta \${eTime} (descartando inválidas/canceladas)...\`);
  
  while (hm) {
    const params = new URLSearchParams();
    params.set('orderState', 'all');
    params.set('starttime', sTime);
    params.set('endtime', eTime);
    params.set('sTime', sTime);
    params.set('eTime', eTime);
    params.set('pageSize', String(P));
    params.set('pageNum', String(pn));
    params.set('query', '');
    params.set('inchina', '');
    if (csrf) params.set('_token', csrf);

    try {
      const res = await fetch('https://www.cssbuy.com/web/order', {
        method: 'POST',
        headers,
        body: params.toString()
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { console.error('Respuesta no JSON (pág ' + pn + '):', text.substring(0, 300)); break; }

      const list = data?.list ?? data?.orders ?? data?.data?.list ?? data?.data?.orders ?? data?.data?.data ?? data?.data ?? (Array.isArray(data) ? data : null);
      if (!Array.isArray(list) || list.length === 0) {
        console.log('Fin de órdenes en página ' + pn);
        break;
      }

      let pageCount = 0;
      let pageSkippedInvalid = 0;
      let pageSkippedDate = 0;

      for (const it of list) {
        if (isInvalidOrder(it, null)) {
          pageSkippedInvalid++;
          continue;
        }

        const extracted = extractItems(it);
        for (const item of extracted) {
          if (isInvalidOrder(item, it)) {
            pageSkippedInvalid++;
            continue;
          }
          if (!isInDateRange(item.fecha_pedido)) {
            pageSkippedDate++;
            continue;
          }
          if (item.oid || item.producto) {
            A.push(item);
            pageCount++;
          }
        }
      }

      console.log(\`📦 Pág \${pn}: \${list.length} registros raw → \${pageCount} válidos agregados (\${pageSkippedInvalid} descartados por inválidos/cancelados, \${pageSkippedDate} fuera de fecha). Total acumulado: \${A.length}\`);

      hm = list.length >= P && A.length < M;
      if (hm) {
        pn++;
        await new Promise(r => setTimeout(r, 400));
      }
    } catch (err) {
      console.error('Error al consultar página ' + pn + ':', err);
      break;
    }
  }

  console.log(\`\\n✅ Extracción finalizada: \${A.length} productos/órdenes válidas encontradas entre \${sTime} y \${eTime}.\`);
  const blob = new Blob([JSON.stringify({ orders: A, sTime, eTime, lastSync: new Date().toISOString(), total: A.length }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'orders.json';
  a.click();
  URL.revokeObjectURL(url);
  console.log('💾 orders.json descargado con éxito!');
})();`;

export function WarehouseScraperModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  startDate?: string;
  endDate?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copyScript = async () => {
    try {
      await navigator.clipboard.writeText(CSSBUY_WAREHOUSE_SCRAPER_SCRIPT);
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
            <div className="w-8 h-8 rounded-[var(--radius)] bg-[var(--color-accent-soft)] text-[var(--color-accent)] flex items-center justify-center">
              <Terminal className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle>Scraper de Órdenes CSSBuy</DialogTitle>
              <DialogDescription>
                Extrae todos tus pedidos válidos en un rango de fechas (excluye automáticamente pedidos cancelados/inválidos)
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto pr-1">
          <div className="p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius)] border border-[var(--color-border)] text-xs text-[var(--color-fg-muted)] space-y-2">
            <p className="font-semibold text-[var(--color-fg)]">Instrucciones paso a paso:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>
                Abrí{" "}
                <a
                  href="https://www.cssbuy.com/shop/cate/order"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--color-accent)] underline inline-flex items-center gap-1"
                >
                  cssbuy.com/shop/cate/order <ExternalLink className="h-3 w-3" />
                </a>{" "}
                (o <code className="font-mono">cssbuy.com/web/order</code>) e iniciá sesión con tu cuenta.
              </li>
              <li>Presioná <kbd className="px-1 py-0.5 bg-[var(--color-bg-muted)] rounded font-mono">F12</kbd> (o click derecho → Inspeccionar → solapa <strong>Console</strong>).</li>
              <li>Pegá el script que copiás abajo y presioná <kbd className="px-1 py-0.5 bg-[var(--color-bg-muted)] rounded font-mono">Enter</kbd>.</li>
              <li>Ingresá la <strong>Fecha de Inicio</strong> y <strong>Fecha de Fin</strong> cuando aparezcan los cuadros de diálogo en el navegador.</li>
              <li>Se descargará automáticamente el archivo <span className="font-mono font-bold text-[var(--color-fg)]">orders.json</span> con todas tus órdenes válidas del período.</li>
              <li>Subí ese archivo en la calculadora usando el botón <strong>"Cargar orders.json"</strong>.</li>
            </ol>
          </div>

          <div className="relative">
            <pre className="p-3 bg-[var(--color-bg-inverse)] text-[var(--color-fg-inverse)] rounded-[var(--radius)] font-mono text-[11px] max-h-56 overflow-auto leading-relaxed select-all">
              {CSSBUY_WAREHOUSE_SCRAPER_SCRIPT}
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

