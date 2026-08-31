"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Plus,
  Trash2,
  Save,
  Download,
  RotateCcw,
  AlertTriangle,
  Info,
  ShoppingBag,
  Plane,
  Shield,
  DollarSign,
  Upload,
  RefreshCw,
  Copy,
  Receipt,
  Wallet,
  Loader2,
  ExternalLink,
  ChevronDown,
  Sparkles,
  Search,
  Filter,
  Check,
  Clock,
  PackageCheck,
  Truck,
  Camera,
  Scale,
  Eye,
  Image as ImageIcon,
  Calendar,
  X,
  MoreHorizontal,
  TrendingUp,
  Wallet2,
} from "lucide-react";
import {
  Product,
  FxRates,
  ShipmentCosts,
  AduanaConfig,
  CalculationResult,
  Cotizacion,
  CssbuyTransaction,
  CssbuyRecordGroup,
  CssbuyOrder,
} from "@/lib/types";
import { calcularTodo, fmtUSD, fmtARS, fmtPct, uid } from "@/lib/utils";
import { loadCalcConfig, saveCalcConfig, CalcConfig, DEFAULT_CALC_CONFIG, CSSBUY_DEPOSIT_FEE_PCT } from "@/lib/pricing";
import { fetchLiveFx } from "@/lib/fx";
import { parseRecords, groupRecordsByOrder, summarizeRecords, calculateRealItemCost } from "@/lib/cssbuy-records";
import { toast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { Badge } from "@/components/ui/Badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/Dialog";
import { ProductsTable } from "@/components/ProductsTable";
import { Menu, MenuTrigger, MenuContent, MenuItem, MenuSeparator, MenuLabel } from "@/components/ui/Menu";
import { StatTile } from "@/components/ui/StatTile";
import { EmptyState } from "@/components/ui/EmptyState";
import { Navbar } from "@/components/Navbar";
import { WarehouseScraperModal } from "@/components/WarehouseScraperModal";
import { RecordScraperModal } from "@/components/RecordScraperModal";

export default function CalculatorPage() {
  const [fx, setFx] = useState<FxRates>(DEFAULT_CALC_CONFIG.fx);
  const [envio, setEnvio] = useState<ShipmentCosts>(DEFAULT_CALC_CONFIG.envio);
  const [aduana, setAduana] = useState<AduanaConfig>(DEFAULT_CALC_CONFIG.aduana);
  const [productos, setProductos] = useState<Product[]>([]);
  const [nombreEnvio, setNombreEnvio] = useState("");
  const [savingCotizacion, setSavingCotizacion] = useState(false);
  const [fxLoading, setFxLoading] = useState(false);

  // Modales
  const [warehouseScraperOpen, setWarehouseScraperOpen] = useState(false);
  const [recordScraperOpen, setRecordScraperOpen] = useState(false);

  // Sync automático de órdenes CSSBuy → Postgres propio
  const [syncingCssbuy, setSyncingCssbuy] = useState(false);

  // CSSBuy Orders & Records
  const [orders, setOrders] = useState<CssbuyOrder[]>([]);
  const [ordersSearch, setOrdersSearch] = useState("");
  const [ordersFilter, setOrdersFilter] = useState<"all" | "process" | "warehouse" | "other">("all");
  const [ordersStartDate, setOrdersStartDate] = useState<string>("");
  const [ordersEndDate, setOrdersEndDate] = useState<string>("");
  const [records, setRecords] = useState<CssbuyTransaction[]>([]);

  const handleDatePreset = (preset: "7d" | "30d" | "90d" | "year" | "all") => {
    const now = new Date();
    const endStr = now.toISOString().slice(0, 10);
    if (preset === "all") {
      setOrdersStartDate("");
      setOrdersEndDate("");
      return;
    }
    let start = new Date();
    if (preset === "7d") {
      start.setDate(now.getDate() - 7);
    } else if (preset === "30d") {
      start.setDate(now.getDate() - 30);
    } else if (preset === "90d") {
      start.setDate(now.getDate() - 90);
    } else if (preset === "year") {
      start = new Date(now.getFullYear(), 0, 1);
    }
    setOrdersStartDate(start.toISOString().slice(0, 10));
    setOrdersEndDate(endStr);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const recordFileInputRef = useRef<HTMLInputElement>(null);

  // Modal de Fotos & QC (Inspección en almacén)
  const [photoModalOrder, setPhotoModalOrder] = useState<CssbuyOrder | null>(null);
  const [activePhotoUrl, setActivePhotoUrl] = useState<string>("");

  const openPhotoModal = (order: CssbuyOrder, initialUrl?: string) => {
    setPhotoModalOrder(order);
    setActivePhotoUrl(initialUrl || order.imagen || order.fotos_qc?.[0] || order.foto_peso || "");
  };

  // Cargar estado inicial desde localStorage en el cliente para evitar hydration mismatch
  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. Cargar configuración guardada
    const cfg = loadCalcConfig();
    setFx(cfg.fx);
    setEnvio(cfg.envio);
    setAduana(cfg.aduana);

    // 2. Cargar órdenes guardadas o sincronizar
    try {
      const localOrders = JSON.parse(localStorage.getItem("cssbuy-orders") || "[]");
      if (Array.isArray(localOrders) && localOrders.length > 0) {
        const valid = localOrders.filter((o: any) => !isInvalidOrder(o));
        setOrders(valid);
        if (valid.length !== localOrders.length) {
          localStorage.setItem("cssbuy-orders", JSON.stringify(valid));
        }
      } else {
        fetch("/api/cssbuy/sync")
          .then((r) => r.json())
          .then((data) => {
            if (data.ok && Array.isArray(data.orders) && data.orders.length > 0) {
              const valid = data.orders.filter((o: any) => !isInvalidOrder(o));
              setOrders(valid);
              localStorage.setItem("cssbuy-orders", JSON.stringify(valid));
            }
          })
          .catch(() => {});
      }
    } catch {}

    // 3. Cargar records de movimientos
    try {
      const localRecords = JSON.parse(localStorage.getItem("cssbuy-records") || "[]");
      if (Array.isArray(localRecords) && localRecords.length > 0) {
        setRecords(localRecords);
      }
    } catch {}

    // 4. Cargar cotización pendiente de localStorage si fue redirigido
    const raw = localStorage.getItem("cssbuy-cotizacion-cargar");
    if (raw) {
      try {
        const cot: Cotizacion = JSON.parse(raw);
        const migratedEnvio = { ...cot.envio };
        if ("freightCNY" in migratedEnvio && !("freightUSD" in migratedEnvio)) {
          (migratedEnvio as any).freightUSD = (migratedEnvio as any).freightCNY;
        }
        setFx(cot.fx);
        setEnvio(migratedEnvio as ShipmentCosts);
        setAduana(cot.aduana);
        setProductos(cot.productos || []);
        setNombreEnvio(cot.nombre || "");
        toast.success("Cotización cargada con éxito", { description: cot.nombre });
      } catch {
        // ignore
      } finally {
        localStorage.removeItem("cssbuy-cotizacion-cargar");
      }
    }
  }, []);

  const syncCssbuy = async () => {
    setSyncingCssbuy(true);
    toast.info("Sincronizando órdenes...", {
      description: "Consultando servidor y base de datos...",
      duration: 4000,
    });
    try {
      const res = await fetch("/api/cssbuy/sync", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        if (Array.isArray(data.orders) && data.orders.length > 0) {
          const valid = data.orders.filter((o: any) => !isInvalidOrder(o));
          setOrders(valid);
          localStorage.setItem("cssbuy-orders", JSON.stringify(valid));
        }
        toast.success("Órdenes sincronizadas con éxito", {
          description: `${data.total} órdenes encontradas (${data.inserted} nuevas, ${data.updated} actualizadas).`,
        });
      } else {
        // Fallback: Si el scraping directo no es posible (ej: en Vercel serverless), cargar lo que ya está en PostgreSQL
        const getRes = await fetch("/api/cssbuy/sync");
        const getData = await getRes.json();
        if (getData.ok && Array.isArray(getData.orders) && getData.orders.length > 0) {
          const valid = getData.orders.filter((o: any) => !isInvalidOrder(o));
          setOrders(valid);
          localStorage.setItem("cssbuy-orders", JSON.stringify(valid));
          toast.success("Órdenes cargadas desde la Base de Datos", {
            description: `${valid.length} órdenes obtenidas de PostgreSQL.`,
          });
        } else {
          toast.error("Error al sincronizar con CSSBuy", {
            description: data.message || "No se pudo conectar a CSSBuy ni a la base de datos.",
            duration: 8000,
          });
        }
      }
    } catch {
      toast.error("Error de red al sincronizar con el servidor");
    } finally {
      setSyncingCssbuy(false);
    }
  };

  // Guardar configuración por defecto cuando cambian tasas base
  const handleSaveDefaultConfig = () => {
    saveCalcConfig({ fx, envio, aduana });
    toast.success("Configuración guardada como predeterminada");
  };

  // Refrescar cotizaciones en vivo manualmente
  const handleRefreshFx = async () => {
    setFxLoading(true);
    try {
      const live = await fetchLiveFx();
      if (live) {
        setFx((prev) => ({ ...prev, ...live }));
        toast.success("Tasas de cambio actualizadas");
      } else {
        toast.error("No se pudo obtener tasas en vivo");
      }
    } catch {
      toast.error("Error al consultar API de cotizaciones");
    } finally {
      setFxLoading(false);
    }
  };

  // Al montar, tomar los valores de dólar actualizados desde la API gratuita (una sola vez)
  useEffect(() => {
    let active = true;
    fetchLiveFx()
      .then((live) => {
        if (!active || !live) return;
        setFx((prev) => ({ ...prev, ...live }));
      })
      .catch(() => {
        // Silencioso: se mantienen los valores por defecto/guardados
      });
    return () => {
      active = false;
    };
  }, []);

  // Cálculo principal
  const resultados: CalculationResult = useMemo(
    () => calcularTodo(productos, fx, envio, aduana),
    [productos, fx, envio, aduana]
  );

  const recordGroups = useMemo(() => groupRecordsByOrder(records), [records]);
  const recordMapByOrderId = useMemo(() => {
    const map = new Map<string, CssbuyRecordGroup>();
    for (const g of recordGroups) map.set(g.orderId, g);
    return map;
  }, [recordGroups]);

  const findRecordGroup = useCallback(
    (product: Product): CssbuyRecordGroup | undefined => {
      if (product.oid && recordMapByOrderId.has(product.oid)) {
        return recordMapByOrderId.get(product.oid);
      }
      if (product.link) {
        return recordGroups.find((g) =>
          g.transactions.some((t) => t.productUrl && t.productUrl === product.link)
        );
      }
      return undefined;
    },
    [recordGroups, recordMapByOrderId]
  );

  const pesoTotalG = useMemo(
    () => productos.reduce((s, p) => s + (p.pesoG || 0) * (p.cantidad || 1), 0),
    [productos]
  );

  // Manejo de productos
  const addProducto = useCallback(() => {
    setProductos((prev) => [
      ...prev,
      {
        id: uid(),
        nombre: "",
        precioCNY: 0,
        envioLocalCNY: 0,
        envioChinaCNY: 0,
        pesoG: 0,
        cantidad: 1,
        precioVentaUSD: 0,
        link: "",
        imgURL: "",
      },
    ]);
  }, []);

  const removeProducto = useCallback((id: string) => {
    setProductos((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const updateProducto = useCallback((id: string, field: keyof Product, value: any) => {
    setProductos((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  }, []);

  const patchProducto = useCallback((id: string, patch: Partial<Product>) => {
    setProductos((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  /**
   * Fija el precio de venta unitario en ARS. Limpia los overrides viejos
   * (markup individual y precio en USD) para que quede una sola fuente de verdad.
   */
  const setPrecioVentaARS = useCallback(
    (id: string, ars: number | undefined) => {
      patchProducto(id, { precioVentaARS: ars, precioVentaUSD: 0, markup: undefined });
    },
    [patchProducto]
  );

  const importFromOrder = useCallback(
    (order: CssbuyOrder) => {
      const exists = productos.find((p) => (order.oid && p.oid === order.oid) || (order.url && p.link === order.url));
      if (exists) {
        toast.info("El producto ya está en la lista");
        return;
      }
      setProductos((prev) => [
        ...prev,
        {
          id: uid(),
          nombre: order.producto || `CSSBuy #${order.oid}`,
          precioCNY: order.precio_unitario_cny || 0,
          envioLocalCNY: order.envio_local_cny || 0,
          envioChinaCNY: order.envio_china_cny || 0,
          pesoG: order.peso_g || 0,
          cantidad: order.cantidad || 1,
          precioVentaUSD: 0,
          link: order.url || "",
          imgURL: order.imagen || "",
          oid: order.oid || undefined,
          fotos_qc: order.fotos_qc,
          foto_peso: order.foto_peso,
        },
      ]);
      toast.success("Producto importado a la calculadora");
    },
    [productos]
  );

  const isWarehouseOrder = (val: string | CssbuyOrder) => {
    const status = typeof val === "string" ? val : val?.estado || "";
    const s = status.toLowerCase();
    return s.includes("warehouse") || s.includes("almac") || s.includes("arrived") || s.includes("入库") || s.includes("到仓");
  };

  const isInvalidOrder = (val: string | CssbuyOrder | any): boolean => {
    if (!val) return true;
    if (typeof val === "string") {
      const s = val.toLowerCase().trim();
      if (!s || s === "0" || s === "-1" || s === "7" || s === "8" || s === "9" || s === "10" || s === "null" || s === "undefined") return true;
      return (
        s.includes("invalid") ||
        s.includes("inválid") ||
        s.includes("invalida") ||
        s.includes("invalido") ||
        s.includes("cancel") ||
        s.includes("cancelled") ||
        s.includes("canceled") ||
        s.includes("cancelado") ||
        s.includes("cancelada") ||
        s.includes("refund") ||
        s.includes("refunded") ||
        s.includes("reembols") ||
        s.includes("return") ||
        s.includes("returned") ||
        s.includes("devuelto") ||
        s.includes("devoluc") ||
        s.includes("close") ||
        s.includes("closed") ||
        s.includes("cerrado") ||
        s.includes("cerrada") ||
        s.includes("reject") ||
        s.includes("unpaid") ||
        s.includes("non-payment") ||
        s.includes("out of stock") ||
        s.includes("sin stock") ||
        s.includes("agotado") ||
        s.includes("expired") ||
        s.includes("fail") ||
        s.includes("problem") ||
        s.includes("after sales") ||
        s.includes("after-sales") ||
        s.includes("无效") ||
        s.includes("已取消") ||
        s.includes("取消") ||
        s.includes("退款") ||
        s.includes("已退款") ||
        s.includes("退货") ||
        s.includes("已退货") ||
        s.includes("关闭") ||
        s.includes("已关闭") ||
        s.includes("失效") ||
        s.includes("已失效") ||
        s.includes("缺货") ||
        s.includes("未付款") ||
        s.includes("异常") ||
        s.includes("删除") ||
        s.includes("拒绝") ||
        s.includes("失败")
      );
    }

    const raw = val.raw || val;
    const rawState = val.state ?? val.status ?? val.orderState ?? val.order_state ?? val.goods_status ?? val.order_status ?? val.pay_status ?? val.cancel_status ?? val.refund_status ??
                     raw.state ?? raw.status ?? raw.orderState ?? raw.order_state ?? raw.goods_status ?? raw.order_status ?? raw.pay_status ?? raw.cancel_status ?? raw.refund_status;
    const rawStateStr = String(rawState ?? "").trim();
    if (rawStateStr === "0" || rawStateStr === "-1" || rawStateStr === "7" || rawStateStr === "8" || rawStateStr === "9" || rawStateStr === "10") {
      return true;
    }

    const isDel = val.is_del ?? val.isdel ?? val.is_delete ?? val.deleted ?? raw.is_del ?? raw.isdel ?? raw.is_delete ?? raw.deleted;
    if (String(isDel) === "1" || String(isDel) === "true") return true;

    const cancelStatus = val.cancel_status ?? val.cancelStatus ?? raw.cancel_status ?? raw.cancelStatus;
    if (String(cancelStatus) === "1" || String(cancelStatus) === "2") return true;

    const refundStatus = val.refund_status ?? val.refundStatus ?? raw.refund_status ?? raw.refundStatus;
    if (String(refundStatus) === "1" || String(refundStatus) === "2") return true;

    const estadoStr = String(
      val.estado ??
      val.statename ??
      val.status_name ??
      val.statusName ??
      val.state_name ??
      val.stateName ??
      val.status ??
      val.state ??
      raw.statename ??
      raw.status_name ??
      raw.statusName ??
      raw.state_name ??
      raw.stateName ??
      raw.status ??
      raw.state ??
      ""
    );

    if (isInvalidOrder(estadoStr)) return true;

    return false;
  };

  const isProcessOrder = (val: string | CssbuyOrder) => {
    const status = typeof val === "string" ? val : val?.estado || "";
    if (isInvalidOrder(status)) return false;
    const s = status.toLowerCase();
    return (
      s.includes("order") ||
      s.includes("paid") ||
      s.includes("pago") ||
      s.includes("dispatch") ||
      s.includes("ship") ||
      s.includes("process") ||
      s.includes("submit") ||
      s.includes("pending") ||
      s.includes("en camino") ||
      s.includes("订购") ||
      s.includes("发货") ||
      s.includes("付款") ||
      s.includes("待")
    );
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      // Excluir órdenes inválidas o canceladas
      if (isInvalidOrder(o)) return false;

      // Filter by category
      if (ordersFilter === "warehouse" && !isWarehouseOrder(o.estado)) return false;
      if (ordersFilter === "process" && (!isProcessOrder(o.estado) || isWarehouseOrder(o.estado))) return false;
      if (ordersFilter === "other" && (isWarehouseOrder(o.estado) || isProcessOrder(o.estado))) return false;

      // Filter by date range
      if (ordersStartDate) {
        const startSec = Math.floor(new Date(`${ordersStartDate}T00:00:00`).getTime() / 1000);
        const orderSec = o.fecha_pedido > 1e11 ? Math.floor(o.fecha_pedido / 1000) : o.fecha_pedido;
        if (orderSec && orderSec < startSec) return false;
      }
      if (ordersEndDate) {
        const endSec = Math.floor(new Date(`${ordersEndDate}T23:59:59`).getTime() / 1000);
        const orderSec = o.fecha_pedido > 1e11 ? Math.floor(o.fecha_pedido / 1000) : o.fecha_pedido;
        if (orderSec && orderSec > endSec) return false;
      }

      // Filter by search
      if (!ordersSearch.trim()) return true;
      const q = ordersSearch.toLowerCase();
      return (
        (o.oid && o.oid.toLowerCase().includes(q)) ||
        (o.producto && o.producto.toLowerCase().includes(q)) ||
        (o.vendedor && o.vendedor.toLowerCase().includes(q)) ||
        (o.tracking && o.tracking.toLowerCase().includes(q)) ||
        (o.estado && o.estado.toLowerCase().includes(q))
      );
    });
  }, [orders, ordersFilter, ordersSearch, ordersStartDate, ordersEndDate]);

  const importFilteredOrders = useCallback(() => {
    if (filteredOrders.length === 0) return;
    const existingOids = new Set(productos.map((p) => p.oid).filter(Boolean));
    const existingLinks = new Set(productos.map((p) => p.link).filter(Boolean));

    const toAdd = filteredOrders.filter(
      (order) => !existingOids.has(order.oid) && (!order.url || !existingLinks.has(order.url))
    );

    if (toAdd.length === 0) {
      toast.info("Los productos seleccionados ya están en la calculadora");
      return;
    }

    const newItems: Product[] = toAdd.map((order) => ({
      id: uid(),
      nombre: order.producto || `CSSBuy #${order.oid}`,
      precioCNY: order.precio_unitario_cny || 0,
      envioLocalCNY: order.envio_local_cny || 0,
      envioChinaCNY: order.envio_china_cny || 0,
      pesoG: order.peso_g || 0,
      cantidad: order.cantidad || 1,
      precioVentaUSD: 0,
      link: order.url || "",
      imgURL: order.imagen || "",
      oid: order.oid || undefined,
      fotos_qc: order.fotos_qc,
      foto_peso: order.foto_peso,
    }));

    setProductos((prev) => [...prev, ...newItems]);
    toast.success(`${newItems.length} productos agregados a la calculadora`);
  }, [filteredOrders, productos]);

  const importAllOrders = useCallback(() => {
    const validOrders = orders.filter((o) => !isInvalidOrder(o));
    if (validOrders.length === 0) return;
    const newItems: Product[] = validOrders.map((order) => ({
      id: uid(),
      nombre: order.producto || `CSSBuy #${order.oid}`,
      precioCNY: order.precio_unitario_cny || 0,
      envioLocalCNY: order.envio_local_cny || 0,
      envioChinaCNY: order.envio_china_cny || 0,
      pesoG: order.peso_g || 0,
      cantidad: order.cantidad || 1,
      precioVentaUSD: 0,
      link: order.url || "",
      imgURL: order.imagen || "",
      oid: order.oid || undefined,
      fotos_qc: order.fotos_qc,
      foto_peso: order.foto_peso,
    }));
    setProductos(newItems);
    toast.success(`${newItems.length} productos agregados a la calculadora`);
  }, [orders]);

  // Importar archivo orders.json
  const handleOrdersFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        const rawList = Array.isArray(json)
          ? json
          : json.orders || json.list || json.data?.list || json.data?.orders || json.data || [];

        const validRawList = rawList.filter((it: any) => {
          const raw = it.raw || it;
          const og = raw.orderGoods;
          const firstOg = Array.isArray(og) ? og[0] : (og && typeof og === "object" ? og : {});
          const stateVal = it.estado ?? it.statename ?? it.status_name ?? it.status ?? raw.state ?? raw.status ?? raw.statename ?? firstOg.status;
          return !isInvalidOrder(String(stateVal ?? ""));
        });

        const list: CssbuyOrder[] = validRawList
          .map((it: any) => {
            const raw = it.raw || it;
            const og = raw.orderGoods;
            const firstOg = Array.isArray(og) ? og[0] : (og && typeof og === "object" ? og : {});

            const imagen = String(
              it.imagen ??
              firstOg.image ??
              firstOg.skuImage ??
              firstOg.pic ??
              firstOg.goodsimg ??
              firstOg.goods_img ??
              raw.goodsimg ??
              raw.goods_img ??
              raw.skuimg ??
              raw.sku_img ??
              raw.image ??
              raw.pic ??
              ""
            );

            const fotos_qc: string[] = [];
            if (Array.isArray(it.fotos_qc)) {
              fotos_qc.push(...it.fotos_qc);
            } else if (Array.isArray(firstOg.qualityImageList)) {
              for (const q of firstOg.qualityImageList) {
                if (q?.url) fotos_qc.push(String(q.url));
                else if (typeof q === "string" && q) fotos_qc.push(q);
              }
            } else if (typeof firstOg.qualityImages === "string" && firstOg.qualityImages.trim()) {
              const spl = firstOg.qualityImages.split(",").map((s: string) => s.trim()).filter(Boolean);
              for (const p of spl) {
                if (p.startsWith("http")) fotos_qc.push(p);
                else fotos_qc.push(`https://usimage.cssbuy.com/${p}`);
              }
            }

            const foto_peso = it.foto_peso || (firstOg.weightImage ? String(firstOg.weightImage) : undefined);

            return {
              oid: String(it.oid ?? it.order_sn ?? firstOg.orderId ?? raw.oid ?? raw.order_sn ?? ""),
              producto: String(it.producto ?? firstOg.name ?? it.goodsname ?? it.goods_name ?? it.title ?? raw.goodsname ?? raw.title ?? `Pedido #${it.oid || ""}`),
              imagen,
              url: String(it.url ?? firstOg.url ?? it.goodsurl ?? it.goods_url ?? raw.goodsurl ?? raw.url ?? ""),
              vendedor: String(it.vendedor ?? firstOg.seller ?? it.goodsseller ?? it.goods_seller ?? raw.goodsseller ?? raw.seller ?? ""),
              variante: String(it.variante ?? firstOg.skuInfo ?? firstOg.remark ?? it.goodssize ?? it.goods_size ?? raw.goodssize ?? raw.size ?? ""),
              precio_unitario_cny: Number(it.precio_unitario_cny ?? firstOg.price ?? it.goodsprice ?? it.goods_price ?? raw.goodsprice ?? raw.price ?? 0),
              envio_local_cny: Number(it.envio_local_cny ?? it.sendprice ?? it.send_price ?? raw.sendprice ?? raw.freight ?? 0),
              envio_china_cny: Number(it.envio_china_cny ?? it.chinashipping ?? raw.chinashipping ?? 0),
              cantidad: Math.max(1, Math.round(Number(it.cantidad ?? firstOg.num ?? it.goodsnum ?? it.goods_num ?? raw.goodsnum ?? raw.quantity ?? 1))),
              estado: String(it.estado ?? it.statename ?? it.status_name ?? it.status ?? raw.statename ?? raw.status ?? "Procesando"),
              peso_g: Number(it.peso_g ?? firstOg.weightWithBox ?? firstOg.weight ?? it.orderweight ?? it.order_weight ?? raw.orderweight ?? raw.weight ?? 0) || 0,
              tracking: String(it.tracking ?? it.expressno ?? it.express_no ?? raw.expressno ?? raw.tracking ?? ""),
              fecha_pedido: Number(it.fecha_pedido ?? it.addtime ?? it.add_time ?? raw.addtime ?? Math.floor(Date.now() / 1000)),
              fotos_qc: fotos_qc.length > 0 ? fotos_qc : undefined,
              foto_peso,
            };
          })
          .filter((o: any) => !isInvalidOrder(o));

        setOrders(list);
        localStorage.setItem("cssbuy-orders", JSON.stringify(list));
        toast.success(`Cargadas ${list.length} órdenes válidas de CSSBuy`);

        // También persistir a la base de datos (en background, no bloquea la UI)
        fetch("/api/cssbuy/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orders: validRawList }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.ok && Array.isArray(data.orders) && data.orders.length > 0) {
              const valid = data.orders.filter((o: any) => !isInvalidOrder(o));
              setOrders(valid);
              localStorage.setItem("cssbuy-orders", JSON.stringify(valid));
              toast.success("Órdenes guardadas en base de datos", {
                description: `${data.inserted} nuevas, ${data.updated} actualizadas`,
              });
            }
          })
          .catch(() => {
            // No hay DB configurada, no pasa nada, las órdenes ya están en localStorage
          });
      } catch (err: any) {
        toast.error("Error al procesar el archivo JSON", { description: err.message });
      }
    };
    reader.readAsText(file);
  };

  // Importar archivo records.json
  const handleRecordsFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        const list = Array.isArray(json) ? json : json.records || [];
        const parsed = parseRecords(list);
        setRecords(parsed);
        localStorage.setItem("cssbuy-records", JSON.stringify(parsed));
        toast.success(`Cargados ${parsed.length} movimientos de CSSBuy`);
      } catch (err: any) {
        toast.error("Error al procesar el archivo JSON", { description: err.message });
      }
    };
    reader.readAsText(file);
  };

  // Guardar cotización
  const guardarCotizacion = useCallback(async () => {
    if (productos.length === 0) {
      toast.error("Agregá al menos un producto");
      return;
    }
    setSavingCotizacion(true);
    const nombre = nombreEnvio.trim() || `Cotización ${new Date().toLocaleDateString("es-AR")}`;

    try {
      const res = await fetch("/api/cotizaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre,
          fx,
          envio,
          aduana,
          productos,
          resultados,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar");

      // Guardar también en localStorage como backup
      const localCotizaciones: Cotizacion[] = JSON.parse(
        localStorage.getItem("cssbuy-cotizaciones-local") || "[]"
      );
      const newCot: Cotizacion = data.cotizacion || {
        id: "local-" + Date.now(),
        fecha: new Date().toISOString(),
        nombre,
        fx,
        envio,
        aduana,
        productos,
        resultados,
      };
      localCotizaciones.unshift(newCot);
      localStorage.setItem("cssbuy-cotizaciones-local", JSON.stringify(localCotizaciones));

      toast.success("Cotización guardada exitosamente", { description: nombre });
    } catch (err: any) {
      toast.error("Error al guardar", { description: err.message });
    } finally {
      setSavingCotizacion(false);
    }
  }, [fx, envio, aduana, productos, resultados, nombreEnvio]);

  // Exportar CSV
  const exportarCSV = useCallback(() => {
    if (resultados.productosCalc.length === 0) {
      toast.error("No hay productos para exportar");
      return;
    }
    const nombre = nombreEnvio.trim() || "cotizacion";
    const header = [
      "Producto",
      "Cantidad",
      "Precio unit CNY",
      "Flete China CNY",
      "Peso unit g",
      "Markup efectivo",
      "Margen %",
      "Link",
      "Costo unit USD",
      "Costo unit ARS",
      "Precio sugerido USD",
      "Precio sugerido ARS",
      "Precio venta USD",
      "Precio venta ARS",
      "Ganancia unit USD",
      "Ganancia total USD",
      "Ganancia total ARS",
    ];
    const rows = resultados.productosCalc.map((p) => [
      `"${p.nombre.replace(/"/g, '""')}"`,
      p.cantidad,
      p.precioCNY,
      p.envioChinaCNY,
      p.pesoG,
      p.markupEfectivo.toFixed(2),
      (p.margenUnitPct * 100).toFixed(1),
      `"${p.link || ""}"`,
      p.costoUnitUSD.toFixed(2),
      p.costoUnitARS.toFixed(2),
      p.precioSugeridoUSD.toFixed(2),
      p.precioSugeridoARS.toFixed(2),
      (fx.blue > 0 ? p.ventaUnitARS / fx.blue : 0).toFixed(2),
      p.ventaUnitARS.toFixed(2),
      p.gananciaUnitUSD.toFixed(2),
      p.gananciaTotalUSD.toFixed(2),
      p.gananciaTotalARS.toFixed(2),
    ]);
    const totales = [
      "TOTAL",
      "",
      "",
      "",
      resultados.pesoTotalG,
      "",
      "",
      "",
      resultados.costoTotalUSD.toFixed(2),
      resultados.costoTotalARS.toFixed(2),
      "",
      "",
      "",
      resultados.ingresoTotalARS.toFixed(2),
      "",
      resultados.gananciaTotalUSD.toFixed(2),
      resultados.gananciaTotalARS.toFixed(2),
    ];
    const csvContent = "\uFEFF" + [header.join(","), ...rows.map((r) => r.join(",")), totales.join(",")].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${nombre.toLowerCase().replace(/\s+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado con éxito");
  }, [resultados, nombreEnvio, fx.blue]);

  // Exportar JSON completo
  const exportarJSON = useCallback(() => {
    const data = {
      nombre: nombreEnvio.trim() || `Cotización ${new Date().toLocaleDateString("es-AR")}`,
      fecha: new Date().toISOString(),
      fx,
      envio,
      aduana,
      productos,
      resultados,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cotizacion-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("JSON exportado con éxito");
  }, [nombreEnvio, fx, envio, aduana, productos, resultados]);

  const resetAll = () => {
    if (productos.length > 0 && !confirm("¿Seguro que querés reiniciar la calculadora? Se perderán los productos actuales.")) return;
    setProductos([]);
    setNombreEnvio("");
    toast.info("Calculadora reiniciada");
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex flex-col">
      <Navbar
        onOpenWarehouseScraper={() => setWarehouseScraperOpen(true)}
        onOpenRecordScraper={() => setRecordScraperOpen(true)}
        onSyncCssbuy={syncCssbuy}
        syncingCssbuy={syncingCssbuy}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-6 space-y-6">
        {/* Top Header & Fast Actions */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--color-fg)]">
              Calculadora de Costos
            </h1>
            <p className="text-xs sm:text-sm text-[var(--color-fg-muted)] mt-0.5">
              Landed cost, flete por peso, aduana y precio de venta, producto por producto.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <input
              type="file"
              ref={fileInputRef}
              accept=".json"
              className="hidden"
              onChange={handleOrdersFileUpload}
            />
            <input
              type="file"
              ref={recordFileInputRef}
              accept=".json"
              className="hidden"
              onChange={handleRecordsFileUpload}
            />

            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={addProducto}
            >
              Agregar producto
            </Button>

            <Menu>
              <MenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  icon={<MoreHorizontal className="h-4 w-4" />}
                  title="Más acciones"
                  aria-label="Más acciones"
                />
              </MenuTrigger>
              <MenuContent>
                <MenuLabel>Importar</MenuLabel>
                <MenuItem
                  icon={<Upload className="h-3.5 w-3.5" />}
                  onSelect={() => fileInputRef.current?.click()}
                >
                  Cargar orders.json
                  <span className="ml-auto font-mono text-[11px] text-[var(--color-fg-subtle)]">
                    {orders.length}
                  </span>
                </MenuItem>
                <MenuItem
                  icon={<Receipt className="h-3.5 w-3.5" />}
                  onSelect={() => recordFileInputRef.current?.click()}
                >
                  Cargar records.json
                  <span className="ml-auto font-mono text-[11px] text-[var(--color-fg-subtle)]">
                    {records.length}
                  </span>
                </MenuItem>

                <MenuSeparator />
                <MenuLabel>Exportar</MenuLabel>
                <MenuItem
                  icon={<Download className="h-3.5 w-3.5" />}
                  disabled={productos.length === 0}
                  onSelect={exportarCSV}
                >
                  Exportar CSV
                </MenuItem>
                <MenuItem
                  icon={<Download className="h-3.5 w-3.5" />}
                  disabled={productos.length === 0}
                  onSelect={exportarJSON}
                >
                  Exportar JSON
                </MenuItem>

                <MenuSeparator />
                <MenuItem
                  icon={<RotateCcw className="h-3.5 w-3.5" />}
                  className="text-[var(--color-danger)]"
                  onSelect={resetAll}
                >
                  Limpiar calculadora
                </MenuItem>
              </MenuContent>
            </Menu>
          </div>
        </div>

        {/* Banner de alertas / resumen rápido */}
        {resultados.alertas.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {resultados.alertas.map((alerta, i) => (
              <Badge
                key={i}
                variant={alerta.type === "warning" ? "warning" : "info"}
                icon={<AlertTriangle className="h-3 w-3" />}
              >
                {alerta.msg}
              </Badge>
            ))}
          </div>
        )}

        {/* Configuration Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Tipos de Cambio */}
          <Card padding="md" className="space-y-3">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-muted)] flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5 text-[var(--color-accent)]" /> Tipos de Cambio
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRefreshFx}
                  disabled={fxLoading}
                  className="text-[11px] text-[var(--color-accent)] hover:underline cursor-pointer inline-flex items-center gap-1 disabled:opacity-50"
                  title="Actualizar dólar desde API gratuita (dolarapi.com / open.er-api.com)"
                >
                  {fxLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  Actualizar
                </button>
                <button
                  onClick={handleSaveDefaultConfig}
                  className="text-[11px] text-[var(--color-accent)] hover:underline cursor-pointer"
                  title="Guardar como valores por defecto"
                >
                  Guardar default
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                label="Dólar Blue (ARS)"
                type="number"
                value={fx.blue || ""}
                onChange={(e) => setFx({ ...fx, blue: parseFloat(e.target.value) || 0 })}
              />
              <Input
                label="CNY por USD"
                type="number"
                step="0.01"
                value={fx.cny || ""}
                onChange={(e) => setFx({ ...fx, cny: parseFloat(e.target.value) || 0 })}
              />
              <Input
                label="Dólar MEP"
                type="number"
                value={fx.mep || ""}
                onChange={(e) => setFx({ ...fx, mep: parseFloat(e.target.value) || 0 })}
              />
              <Input
                label="Dólar Oficial"
                type="number"
                value={fx.oficial || ""}
                onChange={(e) => setFx({ ...fx, oficial: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </Card>

          {/* Envio & Markup */}
          <Card padding="md" className="space-y-3">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-muted)] flex items-center gap-1.5">
                <Plane className="h-3.5 w-3.5 text-[var(--color-info)]" /> Flete y Comisiones
              </span>
              <span className="text-[11px] text-[var(--color-fg-muted)] font-mono">
                {pesoTotalG > 0 ? `${(pesoTotalG / 1000).toFixed(2)} kg` : "0 kg"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                label="Flete Total (USD)"
                type="number"
                step="0.1"
                value={envio.freightUSD || ""}
                onChange={(e) => setEnvio({ ...envio, freightUSD: parseFloat(e.target.value) || 0 })}
                hint={pesoTotalG > 0 ? `USD ${((envio.freightUSD || 0) / (pesoTotalG / 1000 || 1)).toFixed(1)}/kg` : undefined}
              />
              <Input
                label="Markup sugerido"
                type="number"
                step="0.1"
                value={envio.markup || ""}
                onChange={(e) => setEnvio({ ...envio, markup: parseFloat(e.target.value) || 2 })}
                hint={`Precio sugerido = costo x ${(envio.markup || 2).toFixed(1)} · margen ${fmtPct(1 - 1 / (envio.markup || 2))}`}
              />
              <div className="col-span-2">
                <Input
                  label="Fee Depósito CSSBuy (%)"
                  type="number"
                  step="0.001"
                  value={Number(((envio.depositFeePct ?? 0) * 100).toFixed(3))}
                  onChange={(e) => setEnvio({ ...envio, depositFeePct: (parseFloat(e.target.value) || 0) / 100 })}
                  suffix="%"
                />
              </div>
            </div>
          </Card>

          {/* Aduana & Franquicia */}
          <Card padding="md" className="space-y-3">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-muted)] flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-amber-500" /> Aduana e Impuestos
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-[var(--color-fg-muted)]">Franquicia USD 50</span>
                <Switch
                  checked={aduana.dentroFranquicia}
                  onCheckedChange={(c) => setAduana({ ...aduana, dentroFranquicia: c })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                label="Valor Declarado (USD)"
                type="number"
                value={aduana.valorDeclaradoUSD ?? ""}
                onChange={(e) =>
                  setAduana({
                    ...aduana,
                    valorDeclaradoUSD: e.target.value === "" ? null : parseFloat(e.target.value) || 0,
                  })
                }
                placeholder={resultados.fobRealUSD ? resultados.fobRealUSD.toFixed(1) : "Automático"}
              />
              <Input
                label="Pago Neto Manual (USD)"
                type="number"
                value={aduana.pagoNetoImpuestosUSD ?? ""}
                onChange={(e) =>
                  setAduana({
                    ...aduana,
                    pagoNetoImpuestosUSD: e.target.value === "" ? null : parseFloat(e.target.value) || 0,
                  })
                }
                placeholder={resultados.impuestosUSD ? resultados.impuestosUSD.toFixed(1) : "0"}
              />
              <div className="col-span-2 flex items-center justify-between pt-1 text-xs">
                <span className="text-[var(--color-fg-muted)]">Impuestos calculados:</span>
                <span className="font-semibold font-mono text-[var(--color-fg)]">
                  {fmtUSD(resultados.impuestosUSD)} ({fmtARS(resultados.impuestosARS)})
                </span>
              </div>
            </div>
          </Card>
        </div>

        {/* CSSBuy Orders Quick Selector Drawer */}
        {orders.length > 0 && (
          <Card padding="sm" className="bg-[var(--color-bg-subtle)] border border-[var(--color-border)] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-[var(--color-border)] pb-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <ShoppingBag className="h-4 w-4 text-[var(--color-accent)]" />
                <span className="text-xs font-bold text-[var(--color-fg)]">
                  Pedidos CSSBuy ({orders.length})
                </span>
                <span className="text-[11px] text-[var(--color-fg-muted)]">
                  {orders.filter(isWarehouseOrder).length} en almacén • {orders.filter(isProcessOrder).length} en proceso / nuevos
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={importFilteredOrders}
                  disabled={filteredOrders.length === 0}
                  title="Importa solo los pedidos filtrados actualmente"
                >
                  Importar visibles ({filteredOrders.length})
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={importAllOrders}
                  title="Importa todos los pedidos cargados"
                >
                  Importar todos ({orders.length})
                </Button>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="flex flex-col gap-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                  <button
                    onClick={() => setOrdersFilter("all")}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      ordersFilter === "all"
                        ? "bg-[var(--color-fg)] text-[var(--color-bg)] font-semibold shadow-xs"
                        : "bg-[var(--color-bg-elevated)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] border border-[var(--color-border)]"
                    }`}
                  >
                    Todos ({orders.length})
                  </button>
                  <button
                    onClick={() => setOrdersFilter("process")}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                      ordersFilter === "process"
                        ? "bg-[var(--color-info)] text-white font-semibold shadow-xs"
                        : "bg-[var(--color-bg-elevated)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] border border-[var(--color-border)]"
                    }`}
                  >
                    <Clock className="h-3 w-3" /> Nuevos / En Proceso ({orders.filter(isProcessOrder).length})
                  </button>
                  <button
                    onClick={() => setOrdersFilter("warehouse")}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                      ordersFilter === "warehouse"
                        ? "bg-[var(--color-success)] text-white font-semibold shadow-xs"
                        : "bg-[var(--color-bg-elevated)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] border border-[var(--color-border)]"
                    }`}
                  >
                    <PackageCheck className="h-3 w-3" /> En Almacén ({orders.filter(isWarehouseOrder).length})
                  </button>
                  <button
                    onClick={() => setOrdersFilter("other")}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      ordersFilter === "other"
                        ? "bg-[var(--color-fg)] text-[var(--color-bg)] font-semibold shadow-xs"
                        : "bg-[var(--color-bg-elevated)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] border border-[var(--color-border)]"
                    }`}
                  >
                    Otros ({orders.filter((o) => !isWarehouseOrder(o.estado) && !isProcessOrder(o.estado)).length})
                  </button>
                </div>

                <div className="relative max-w-xs w-full">
                  <Search className="h-3 w-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-fg-subtle)]" />
                  <input
                    type="text"
                    placeholder="Buscar por ID, producto o estado..."
                    value={ordersSearch}
                    onChange={(e) => setOrdersSearch(e.target.value)}
                    className="w-full h-7 pl-7 pr-3 text-xs bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-border-focus)]"
                  />
                </div>
              </div>

              {/* Barra de Filtro de Fechas */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--color-border)]/70 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1 text-[var(--color-fg-muted)] font-medium text-[11px]">
                    <Calendar className="h-3.5 w-3.5 text-[var(--color-accent)]" />
                    <span>Fechas:</span>
                  </div>

                  <div className="flex items-center gap-1.5 bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded px-2 py-0.5 shadow-xs">
                    <label className="text-[11px] text-[var(--color-fg-muted)] font-medium">Desde:</label>
                    <input
                      type="date"
                      value={ordersStartDate}
                      onChange={(e) => setOrdersStartDate(e.target.value)}
                      className="bg-transparent text-xs text-[var(--color-fg)] focus:outline-none cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded px-2 py-0.5 shadow-xs">
                    <label className="text-[11px] text-[var(--color-fg-muted)] font-medium">Hasta:</label>
                    <input
                      type="date"
                      value={ordersEndDate}
                      onChange={(e) => setOrdersEndDate(e.target.value)}
                      className="bg-transparent text-xs text-[var(--color-fg)] focus:outline-none cursor-pointer"
                    />
                  </div>

                  {(ordersStartDate || ordersEndDate) && (
                    <button
                      onClick={() => handleDatePreset("all")}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[var(--color-bg-muted)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] text-[11px] font-medium transition-colors cursor-pointer"
                      title="Limpiar filtro de fechas"
                    >
                      <X className="h-3 w-3" /> Limpiar
                    </button>
                  )}
                </div>

                {/* Atajos Rápidos */}
                <div className="flex items-center gap-1 overflow-x-auto text-[11px]">
                  <span className="text-[var(--color-fg-subtle)] mr-0.5">Atajos:</span>
                  <button
                    type="button"
                    onClick={() => handleDatePreset("7d")}
                    className="px-2 py-0.5 rounded border border-[var(--color-border)] bg-[var(--color-bg-elevated)] hover:bg-[var(--color-bg-muted)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors cursor-pointer"
                  >
                    7 días
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDatePreset("30d")}
                    className="px-2 py-0.5 rounded border border-[var(--color-border)] bg-[var(--color-bg-elevated)] hover:bg-[var(--color-bg-muted)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors cursor-pointer"
                  >
                    30 días
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDatePreset("90d")}
                    className="px-2 py-0.5 rounded border border-[var(--color-border)] bg-[var(--color-bg-elevated)] hover:bg-[var(--color-bg-muted)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors cursor-pointer"
                  >
                    90 días
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDatePreset("year")}
                    className="px-2 py-0.5 rounded border border-[var(--color-border)] bg-[var(--color-bg-elevated)] hover:bg-[var(--color-bg-muted)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors cursor-pointer"
                  >
                    Este año
                  </button>
                </div>
              </div>
            </div>

            {/* Orders Cards Grid */}
            {filteredOrders.length === 0 ? (
              <div className="p-4 text-center text-xs text-[var(--color-fg-muted)] bg-[var(--color-bg-elevated)] rounded border border-[var(--color-border)]">
                No hay órdenes que coincidan con la búsqueda o filtro actual.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 max-h-72 overflow-y-auto pr-1">
                {filteredOrders.map((order) => {
                  const added = productos.some(
                    (p) => (order.oid && p.oid === order.oid) || (order.url && p.link === order.url)
                  );
                  const isWh = isWarehouseOrder(order.estado);
                  const isProc = isProcessOrder(order.estado);

                  return (
                    <div
                      key={order.oid || order.url}
                      className={`p-2.5 rounded-[var(--radius-sm)] border text-xs flex flex-col justify-between gap-2 transition-all ${
                        added
                          ? "bg-[var(--color-bg-muted)]/60 border-transparent opacity-65"
                          : "bg-[var(--color-bg-elevated)] border-[var(--color-border)] hover:border-[var(--color-accent)] hover:shadow-xs"
                      }`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        {order.imagen || (order.fotos_qc && order.fotos_qc.length > 0) || order.foto_peso ? (
                          <button
                            type="button"
                            onClick={() => openPhotoModal(order)}
                            className="relative group flex-shrink-0 cursor-pointer focus:outline-none rounded overflow-hidden"
                            title="Ver fotos del producto, inspección QC y balanza"
                          >
                            <img
                              src={order.imagen || order.fotos_qc?.[0] || order.foto_peso}
                              alt=""
                              className="w-11 h-11 rounded object-cover flex-shrink-0 border border-[var(--color-border)] group-hover:scale-105 transition-transform"
                            />
                            <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              <Eye className="h-3.5 w-3.5 text-white drop-shadow" />
                            </div>
                            {order.fotos_qc && order.fotos_qc.length > 0 && (
                              <span className="absolute bottom-0 right-0 bg-emerald-600 text-white text-[8px] font-bold px-1 rounded-tl leading-tight shadow-xs">
                                QC
                              </span>
                            )}
                          </button>
                        ) : (
                          <div className="w-11 h-11 rounded bg-[var(--color-bg-muted)] flex items-center justify-center text-sm flex-shrink-0">
                            📦
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <span className="font-mono font-bold text-[11px] text-[var(--color-fg)]">
                              #{order.oid}
                            </span>
                            <span
                              className={`text-[9px] font-semibold px-1.5 py-0.5 rounded leading-none ${
                                isWh
                                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                  : isProc
                                  ? "bg-sky-500/15 text-sky-600 dark:text-sky-400"
                                  : "bg-slate-500/15 text-slate-600 dark:text-slate-400"
                              }`}
                            >
                              {order.estado || "Procesando"}
                            </span>
                          </div>
                          <p className="text-xs font-medium text-[var(--color-fg)] truncate" title={order.producto}>
                            {order.producto || `#${order.oid}`}
                          </p>
                          {order.variante && (
                            <p className="text-[11px] text-[var(--color-fg-muted)] truncate">
                              {order.variante}
                            </p>
                          )}

                          {/* Badges de fotos disponibles */}
                          {(Boolean(order.fotos_qc?.length) || Boolean(order.foto_peso)) && (
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              {order.fotos_qc && order.fotos_qc.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => openPhotoModal(order, order.fotos_qc![0])}
                                  className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors cursor-pointer"
                                  title="Ver fotos de inspección en almacén"
                                >
                                  <Camera className="h-2.5 w-2.5" />
                                  {order.fotos_qc.length} fotos QC
                                </button>
                              )}
                              {order.foto_peso && (
                                <button
                                  type="button"
                                  onClick={() => openPhotoModal(order, order.foto_peso)}
                                  className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors cursor-pointer"
                                  title="Ver foto de la balanza con peso real"
                                >
                                  <Scale className="h-2.5 w-2.5" />
                                  Balanza
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-[var(--color-border)]/60 text-[11px]">
                        <div className="flex items-center gap-2 text-[var(--color-fg-muted)] flex-wrap">
                          <span className="font-mono font-bold text-[var(--color-fg)]">
                            ¥{order.precio_unitario_cny}
                          </span>
                          {order.peso_g > 0 && (
                            <span className="text-[11px]">{order.peso_g}g</span>
                          )}
                          {order.fecha_pedido ? (
                            <span className="text-[11px] text-[var(--color-fg-subtle)] font-mono flex items-center gap-0.5" title="Fecha del pedido">
                              <Calendar className="h-2.5 w-2.5" />
                              {new Date((order.fecha_pedido > 1e11 ? order.fecha_pedido : order.fecha_pedido * 1000)).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                            </span>
                          ) : null}
                        </div>

                        <Button
                          variant={added ? "secondary" : "outline"}
                          size="sm"
                          className="h-6 px-2 text-[11px]"
                          disabled={added}
                          icon={added ? <Check className="h-3 w-3 text-[var(--color-success)]" /> : <Plus className="h-3 w-3" />}
                          onClick={() => importFromOrder(order)}
                        >
                          {added ? "Agregado" : "Agregar"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        )}

        {/* Products Table Section */}
        <Card padding="none" className="overflow-hidden">
          <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between flex-wrap gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-[var(--color-fg)]">
                Productos en el paquete{" "}
                <span className="text-[var(--color-fg-muted)] font-mono tnum font-medium">
                  ({productos.length})
                </span>
              </h2>
              <p className="text-xs text-[var(--color-fg-muted)] mt-0.5">
                Peso{" "}
                <span className="font-mono tnum font-semibold text-[var(--color-fg)]">
                  {(pesoTotalG / 1000).toFixed(2)} kg
                </span>
                {" · "}FOB{" "}
                <span className="font-mono tnum font-semibold text-[var(--color-fg)]">
                  {fmtUSD(resultados.productosUSDTotal)}
                </span>
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={addProducto}
            >
              Agregar producto
            </Button>
          </div>

          {productos.length === 0 ? (
            <EmptyState
              className="border-0 rounded-none bg-transparent py-14"
              icon={<ShoppingBag className="h-5 w-5" />}
              title="Todavía no hay productos"
              description="Importá tus órdenes de CSSBuy desde el panel de arriba, o cargá un producto a mano para simular el costo."
              action={
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Plus className="h-3.5 w-3.5" />}
                  onClick={addProducto}
                >
                  Agregar producto
                </Button>
              }
            />
          ) : (
            <ProductsTable
              items={resultados.productosCalc}
              raw={productos}
              blue={fx.blue}
              markupGlobal={envio.markup || 2}
              onUpdate={updateProducto}
              onSetPrecioARS={setPrecioVentaARS}
              onRemove={removeProducto}
              onOpenPhotos={(p) => {
                const matchingOrder = orders.find((o) => o.oid === p.oid);
                openPhotoModal(
                  matchingOrder || {
                    oid: p.oid || "",
                    producto: p.nombre,
                    imagen: p.imgURL || "",
                    url: p.link || "",
                    vendedor: "",
                    variante: "",
                    precio_unitario_cny: p.precioCNY,
                    envio_local_cny: p.envioLocalCNY,
                    envio_china_cny: p.envioChinaCNY,
                    cantidad: p.cantidad,
                    estado: "En paquete",
                    peso_g: p.pesoG,
                    tracking: "",
                    fecha_pedido: 0,
                    fotos_qc: p.fotos_qc,
                    foto_peso: p.foto_peso,
                  }
                );
              }}
            />
          )}
        </Card>

        {/* Global Summary Bottom Card */}
        {productos.length > 0 && (
          <Card padding="none" className="overflow-hidden shadow-[var(--shadow-md)]">
            <div className="grid grid-cols-2 lg:grid-cols-4">
              <div className="p-4 border-b border-r border-[var(--color-border)] lg:border-b-0">
                <StatTile
                  label="Costo total"
                  icon={<Wallet2 className="h-3.5 w-3.5" />}
                  value={fmtARS(resultados.costoTotalARS)}
                  sub={fmtUSD(resultados.costoTotalUSD)}
                />
              </div>

              <div className="p-4 border-b border-[var(--color-border)] lg:border-b-0 lg:border-r">
                <StatTile
                  label="Ingreso"
                  icon={<DollarSign className="h-3.5 w-3.5" />}
                  value={fmtARS(resultados.ingresoTotalARS)}
                  sub={fmtUSD(resultados.ingresoTotalUSD)}
                  tone="accent"
                />
              </div>

              <div className="p-4 border-r border-[var(--color-border)]">
                <StatTile
                  label="Ganancia"
                  icon={<TrendingUp className="h-3.5 w-3.5" />}
                  value={`${resultados.gananciaTotalARS >= 0 ? "+" : ""}${fmtARS(resultados.gananciaTotalARS)}`}
                  sub={`${resultados.gananciaTotalUSD >= 0 ? "+" : ""}${fmtUSD(resultados.gananciaTotalUSD)} · margen ${fmtPct(
                    resultados.ingresoTotalUSD > 0
                      ? resultados.gananciaTotalUSD / resultados.ingresoTotalUSD
                      : 0
                  )}`}
                  tone={resultados.gananciaTotalUSD >= 0 ? "success" : "danger"}
                />
              </div>

              {/* Guardar cotización */}
              <div className="p-4 flex flex-col justify-center gap-2 bg-[var(--color-bg-subtle)]">
                <Input
                  placeholder="Nombre de la cotización"
                  value={nombreEnvio}
                  onChange={(e) => setNombreEnvio(e.target.value)}
                  className="h-9"
                />
                <Button
                  variant="primary"
                  size="sm"
                  className="w-full"
                  icon={<Save className="h-3.5 w-3.5" />}
                  loading={savingCotizacion}
                  onClick={guardarCotizacion}
                >
                  Guardar cotización
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Espacio para que la barra fija de mobile no tape el final */}
        {productos.length > 0 && <div className="h-32 md:h-20 lg:hidden" aria-hidden />}
      </main>

      {/* Barra de resultado siempre visible en mobile */}
      {productos.length > 0 && (
        <div className="lg:hidden fixed bottom-[52px] md:bottom-0 inset-x-0 z-30 border-t border-[var(--color-border)] bg-[var(--color-bg-elevated)]/95 backdrop-blur-md px-4 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 leading-tight">
              <span className="block text-[11px] uppercase tracking-wide text-[var(--color-fg-muted)]">
                Costo
              </span>
              <span className="font-mono tnum text-sm font-semibold truncate">
                {fmtARS(resultados.costoTotalARS)}
              </span>
            </div>
            <div className="min-w-0 leading-tight text-right">
              <span className="block text-[11px] uppercase tracking-wide text-[var(--color-fg-muted)]">
                Ganancia
              </span>
              <span
                className={`font-mono tnum text-sm font-bold truncate ${
                  resultados.gananciaTotalARS >= 0
                    ? "text-[var(--color-success)]"
                    : "text-[var(--color-danger)]"
                }`}
              >
                {resultados.gananciaTotalARS >= 0 ? "+" : ""}
                {fmtARS(resultados.gananciaTotalARS)}
              </span>
            </div>
          </div>
        </div>
      )}


      {/* Order Photos & QC Modal */}
      <Dialog
        open={!!photoModalOrder}
        onOpenChange={(open) => {
          if (!open) setPhotoModalOrder(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-4 sm:p-6 overflow-hidden">
          <DialogHeader className="pb-2 border-b border-[var(--color-border)]">
            <div className="flex items-start justify-between gap-3 pr-6">
              <div className="min-w-0">
                <DialogTitle className="text-base font-bold text-[var(--color-fg)] flex items-center gap-2">
                  <Camera className="h-4 w-4 text-[var(--color-accent)] flex-shrink-0" />
                  <span>Fotos del Pedido #{photoModalOrder?.oid}</span>
                </DialogTitle>
                <DialogDescription className="text-xs line-clamp-1 mt-0.5">
                  {photoModalOrder?.producto}
                </DialogDescription>
              </div>
              {photoModalOrder?.url && (
                <a
                  href={photoModalOrder.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-[var(--color-accent)] hover:underline inline-flex items-center gap-1 flex-shrink-0 font-medium"
                >
                  Ver producto <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </DialogHeader>

          {photoModalOrder && (
            <div className="flex flex-col gap-4 overflow-y-auto pt-2">
              {/* Main Active Photo Preview */}
              <div className="relative w-full aspect-[4/3] bg-black/5 dark:bg-black/40 rounded-[var(--radius)] overflow-hidden border border-[var(--color-border)] flex items-center justify-center">
                {activePhotoUrl ? (
                  <img
                    src={activePhotoUrl}
                    alt={photoModalOrder.producto}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-center text-xs text-[var(--color-fg-muted)] p-8">
                    No hay vista previa disponible
                  </div>
                )}
                {activePhotoUrl && (
                  <a
                    href={activePhotoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="absolute bottom-2 right-2 px-2.5 py-1 text-[11px] bg-black/75 hover:bg-black/90 text-white rounded-[var(--radius-sm)] flex items-center gap-1 shadow-md transition-colors font-medium"
                  >
                    <ExternalLink className="h-3 w-3" /> Abrir original HD
                  </a>
                )}
              </div>

              {/* Thumbnails list grouped by type */}
              <div className="space-y-3">
                {/* 1. Foto principal */}
                {photoModalOrder.imagen && (
                  <div>
                    <span className="text-[11px] font-semibold text-[var(--color-fg-muted)] uppercase tracking-wider block mb-1.5">
                      Foto del Producto / SKU
                    </span>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setActivePhotoUrl(photoModalOrder.imagen)}
                        className={`relative w-16 h-16 rounded-[var(--radius-sm)] overflow-hidden border-2 transition-all cursor-pointer ${
                          activePhotoUrl === photoModalOrder.imagen
                            ? "border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/20"
                            : "border-[var(--color-border)] hover:border-[var(--color-fg-muted)]"
                        }`}
                      >
                        <img
                          src={photoModalOrder.imagen}
                          alt="Cover"
                          className="w-full h-full object-cover"
                        />
                      </button>
                    </div>
                  </div>
                )}

                {/* 2. Fotos QC en almacén */}
                {photoModalOrder.fotos_qc && photoModalOrder.fotos_qc.length > 0 && (
                  <div>
                    <span className="text-[11px] font-semibold text-[var(--color-fg-muted)] uppercase tracking-wider block mb-1.5 flex items-center gap-1">
                      <Camera className="h-3 w-3 text-emerald-500" />
                      Fotos QC de Inspección ({photoModalOrder.fotos_qc.length})
                    </span>
                    <div className="flex items-center gap-2 flex-wrap">
                      {photoModalOrder.fotos_qc.map((url, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setActivePhotoUrl(url)}
                          className={`relative w-16 h-16 rounded-[var(--radius-sm)] overflow-hidden border-2 transition-all cursor-pointer ${
                            activePhotoUrl === url
                              ? "border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/20"
                              : "border-[var(--color-border)] hover:border-[var(--color-fg-muted)]"
                          }`}
                        >
                          <img
                            src={url}
                            alt={`QC ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <span className="absolute bottom-0 inset-x-0 bg-black/70 text-white text-[8px] text-center font-mono py-0.5">
                            QC #{idx + 1}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. Foto balanza de peso */}
                {photoModalOrder.foto_peso && (
                  <div>
                    <span className="text-[11px] font-semibold text-[var(--color-fg-muted)] uppercase tracking-wider block mb-1.5 flex items-center gap-1">
                      <Scale className="h-3 w-3 text-amber-500" />
                      Foto de Balanza / Peso medido ({photoModalOrder.peso_g}g)
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setActivePhotoUrl(photoModalOrder.foto_peso!)}
                        className={`relative w-16 h-16 rounded-[var(--radius-sm)] overflow-hidden border-2 transition-all cursor-pointer ${
                          activePhotoUrl === photoModalOrder.foto_peso
                            ? "border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/20"
                            : "border-[var(--color-border)] hover:border-[var(--color-fg-muted)]"
                        }`}
                      >
                        <img
                          src={photoModalOrder.foto_peso}
                          alt="Peso"
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute bottom-0 inset-x-0 bg-black/70 text-white text-[8px] text-center font-mono py-0.5">
                          Balanza
                        </span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Scraper Modals */}
      <WarehouseScraperModal
        open={warehouseScraperOpen}
        onOpenChange={setWarehouseScraperOpen}
      />
      <RecordScraperModal
        open={recordScraperOpen}
        onOpenChange={setRecordScraperOpen}
      />
    </div>
  );
}
