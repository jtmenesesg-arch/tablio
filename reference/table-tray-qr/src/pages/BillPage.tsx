import { useState, useRef, useCallback, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Camera, X, AlertTriangle, Loader2 } from "lucide-react";
import { BrowserQRCodeReader } from "@zxing/browser";
import { formatCLP } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { useCartStore } from "@/store/cartStore";
import { Input } from "@/components/ui/input";

/* ---------- helpers ---------- */
function extractTokenFromScan(raw: string): string {
  try {
    const url = new URL(raw);
    return url.searchParams.get("t") || raw;
  } catch {
    return raw;
  }
}

interface OrderWithItems {
  id: string;
  order_number: number;
  status: string;
  total_amount: number;
  confirmed_at: string | null;
  items: {
    menu_item_name: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
    selected_modifiers: any;
  }[];
}

type PageState = "summary" | "scanning" | "processing" | "success" | "error";

const TIP_OPTIONS = [
  { label: "Sin propina", pct: 0 },
  { label: "10%", pct: 10 },
  { label: "15%", pct: 15 },
  { label: "20%", pct: 20 },
];

/* ---------- component ---------- */
export default function BillPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tableTokenFromUrl = searchParams.get("t") || "";
  const storeTableToken = useCartStore((s) => s.tableToken);
  const tableToken = tableTokenFromUrl || storeTableToken || "";
  const { toast } = useToast();

  const [pageState, setPageState] = useState<PageState>("summary");
  const [errorMsg, setErrorMsg] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [selectedTipIdx, setSelectedTipIdx] = useState<number | null>(null);
  const [customTip, setCustomTip] = useState("");
  const selectedTipIdxRef = useRef<number | null>(null);
  const customTipRef = useRef<string>("");
  const [showBackBtn, setShowBackBtn] = useState(false);
  const [finalTotal, setFinalTotal] = useState(0);
  const [finalTip, setFinalTip] = useState(0);
  const [sessionTimeout, setSessionTimeout] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const codeReaderRef = useRef<BrowserQRCodeReader | null>(null);
  const scanProcessedRef = useRef(false);

  useEffect(() => { selectedTipIdxRef.current = selectedTipIdx; }, [selectedTipIdx]);
  useEffect(() => { customTipRef.current = customTip; }, [customTip]);

  /* ---- queries ---- */
  const { data: tenant } = useQuery({
    queryKey: ["tenant-bill", slug],
    queryFn: async () => {
      const { data } = await supabase
        .from("tenants")
        .select("id, name, primary_color")
        .eq("slug", slug!)
        .maybeSingle();
      return data;
    },
    enabled: !!slug,
    staleTime: Infinity,
  });

  const primaryColor = tenant?.primary_color || "#E8531D";

  const { data: tableData } = useQuery({
    queryKey: ["table-bill", tableToken],
    queryFn: async () => {
      const { data } = await supabase
        .from("tables")
        .select("id, number, name, tenant_id, branch_id")
        .eq("qr_token", tableToken)
        .maybeSingle();
      return data;
    },
    enabled: !!tableToken,
    staleTime: Infinity,
  });

  const { data: session } = useQuery({
    queryKey: ["session-bill", tableData?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("table_sessions")
        .select("id, total_amount")
        .eq("table_id", tableData!.id)
        .eq("is_active", true)
        .maybeSingle();
      return data;
    },
    enabled: !!tableData?.id,
    staleTime: 0,
    refetchOnMount: true,
  });

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders-bill", session?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, order_number, status, total_amount, confirmed_at")
        .eq("session_id", session!.id)
        .neq("status", "cancelled")
        .order("confirmed_at", { ascending: true });

      if (!data) return [];

      const ordersWithItems: OrderWithItems[] = [];
      for (const o of data) {
        const { data: items } = await supabase
          .from("order_items")
          .select("menu_item_name, quantity, unit_price, subtotal, selected_modifiers")
          .eq("order_id", o.id);
        ordersWithItems.push({ ...o, items: items || [] });
      }
      return ordersWithItems;
    },
    enabled: !!session?.id,
    staleTime: 5000,
  });

  const subtotal = orders.reduce((s, o) => s + o.total_amount, 0);

  /* ---- tip logic ---- */
  const tipAmount = (() => {
    if (customTip) return parseInt(customTip, 10) || 0;
    if (selectedTipIdx !== null) return Math.round(subtotal * (TIP_OPTIONS[selectedTipIdx].pct / 100));
    return 0;
  })();

  const tipPercentage = selectedTipIdx !== null && !customTip ? TIP_OPTIONS[selectedTipIdx].pct : 0;
  const total = subtotal + tipAmount;

  /* ---- camera ---- */
  useEffect(() => {
    return () => stopCamera();
  }, []);

  const stopCamera = useCallback(() => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
  }, []);

  const startScanning = useCallback(async () => {
    setCameraError("");
    scanProcessedRef.current = false;
    setPageState("scanning");
    try {
      const reader = new BrowserQRCodeReader();
      codeReaderRef.current = reader;
      await reader.decodeFromConstraints(
        { video: { facingMode: "environment" } },
        videoRef.current!,
        (result) => {
          if (result && !scanProcessedRef.current) {
            scanProcessedRef.current = true;
            const token = extractTokenFromScan(result.getText());
            stopCamera();
            handleScannedToken(token);
          }
        },
      );
    } catch (err: any) {
      if (err.name === "NotAllowedError" || err.message?.includes("Permission")) {
        setCameraError("camera_denied");
      } else {
        setCameraError("camera_error");
      }
      setPageState("summary");
    }
  }, [stopCamera]);

  const cancelScanning = useCallback(() => {
    stopCamera();
    setPageState("summary");
  }, [stopCamera]);

  /* ---- bill creation ---- */
  const handleScannedToken = useCallback(
    async (scannedToken: string) => {
      setPageState("processing");
      try {
        const { data: scannedTable } = await supabase
          .from("tables")
          .select("id, tenant_id, branch_id")
          .eq("qr_token", scannedToken)
          .maybeSingle();

        if (!scannedTable) throw new Error("QR no válido. Escanea la tarjeta de tu mesa.");
        if (tenant?.id && scannedTable.tenant_id !== tenant.id) throw new Error("QR incorrecto.");

        // Find active session from the scanned table (don't rely on pre-loaded session)
        let activeSessionId = session?.id;
        if (!activeSessionId) {
          const { data: foundSession } = await supabase
            .from("table_sessions")
            .select("id")
            .eq("table_id", scannedTable.id)
            .eq("is_active", true)
            .maybeSingle();
          activeSessionId = foundSession?.id;
        }

        if (!activeSessionId) throw new Error("No se encontró una sesión activa en esta mesa.");

        // Always fetch real order totals from DB to avoid stale/empty state
        const { data: sessionOrders } = await supabase
          .from("orders")
          .select("total_amount")
          .eq("session_id", activeSessionId)
          .neq("status", "cancelled");

        const realSubtotal = (sessionOrders ?? []).reduce((s, o) => s + o.total_amount, 0);
        const effectiveSubtotal = realSubtotal > 0 ? realSubtotal : subtotal;

        // Recalculate tip based on real subtotal
        const currentTipIdx = selectedTipIdxRef.current;
        const currentCustomTip = customTipRef.current;
        const effectiveTip = (() => {
          if (currentCustomTip) return parseInt(currentCustomTip, 10) || 0;
          if (currentTipIdx !== null) return Math.round(effectiveSubtotal * (TIP_OPTIONS[currentTipIdx].pct / 100));
          return 0;
        })();
        const effectiveTipPercentage = currentTipIdx !== null && !currentCustomTip
          ? TIP_OPTIONS[currentTipIdx].pct
          : 0;
        const effectiveTotal = effectiveSubtotal + effectiveTip;

        const { error: billError } = await supabase.from("bill_requests").insert({
          tenant_id: scannedTable.tenant_id,
          session_id: activeSessionId,
          table_id: scannedTable.id,
          branch_id: scannedTable.branch_id,
          total_amount: effectiveSubtotal,
          tip_amount: effectiveTip,
          tip_percentage: effectiveTipPercentage,
          status: "pending",
          requested_at: new Date().toISOString(),
        });

        if (billError) {
          console.error("Bill insert error:", billError);
          throw new Error("Error al enviar la solicitud: " + billError.message);
        }

        // Update table status
        await supabase.from("tables").update({ status: "waiting_bill" }).eq("id", scannedTable.id);

        setFinalTotal(effectiveTotal);
        setFinalTip(effectiveTip);
        setPageState("success");
      } catch (err: any) {
        setErrorMsg(err.message || "Error desconocido");
        setPageState("error");
      }
    },
    [tenant?.id, session?.id, subtotal, total],
  );

  // Session timeout guard
  useEffect(() => {
    const t = setTimeout(() => setSessionTimeout(true), 3000);
    return () => clearTimeout(t);
  }, []);

  // Show "back to start" button after 3s on success
  useEffect(() => {
    if (pageState === "success") {
      const timer = setTimeout(() => setShowBackBtn(true), 3000);
      return () => clearTimeout(timer);
    }
    setShowBackBtn(false);
  }, [pageState]);

  const formatTime = (iso: string | null) => {
    if (!iso) return "";
    return new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  };

  const qs = tableToken ? `?t=${tableToken}` : "";

  /* ========== RENDER ========== */

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // If no session loaded from token, show scan-first flow instead of blocking
  if (!session && !isLoading && sessionTimeout && !tableToken) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background px-4">
          <button
            onClick={() => navigate(`/${slug}/menu`)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="text-sm font-bold text-foreground">La cuenta</span>
          <div className="w-9" />
        </header>
        <div className="flex flex-col items-center justify-center px-6 pt-16 text-center">
          <p className="text-5xl mb-4">📱</p>
          <p className="text-base font-bold text-foreground">Escanea el QR de tu mesa</p>
          <p className="mt-1 text-sm text-muted-foreground mb-6">Para pedir la cuenta, escanea la tarjeta QR de tu mesa.</p>
          <button
            onClick={startScanning}
            className="flex items-center justify-center gap-2 rounded-2xl px-8 py-4 text-base font-semibold text-white shadow-lg"
            style={{ backgroundColor: primaryColor }}
          >
            <Camera className="h-5 w-5" />
            Escanear QR
          </button>
        </div>
        <video
          ref={videoRef}
          className={pageState === "scanning" ? "fixed inset-0 z-50 h-full w-full object-cover" : "hidden"}
          autoPlay
          playsInline
          muted
        />
        {pageState === "scanning" && (
          <div className="fixed inset-0 z-[51]">
            <div className="absolute top-6 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-5 py-2">
              <p className="text-white text-sm font-medium">Apunta al QR de tu mesa</p>
            </div>
            <button onClick={cancelScanning} className="absolute top-6 right-4 rounded-full bg-black/50 p-2">
              <X className="h-5 w-5 text-white" />
            </button>
          </div>
        )}
        <AnimatePresence>
          {pageState === "processing" && (
            <motion.div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/90" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
            </motion.div>
          )}
          {pageState === "success" && (
            <motion.div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-background px-6 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <p className="text-6xl mb-4">✅</p>
              <p className="text-xl font-bold text-foreground">¡Cuenta solicitada!</p>
              <p className="text-sm text-muted-foreground mt-2">El mozo llegará pronto con la máquina de pago.</p>
            </motion.div>
          )}
          {pageState === "error" && (
            <motion.div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-background px-6 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
              <p className="text-base font-bold text-foreground">{errorMsg}</p>
              <button onClick={() => setPageState("summary")} className="mt-4 text-sm text-primary underline">Reintentar</button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <video
        ref={videoRef}
        className={pageState === "scanning" ? "fixed inset-0 z-50 h-full w-full object-cover" : "hidden"}
        autoPlay
        playsInline
        muted
      />

      {/* Header */}
      {pageState !== "scanning" && pageState !== "processing" && pageState !== "success" && (
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background px-4">
          <button
            onClick={() => navigate(`/${slug}/tracking${qs}`)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="text-sm font-bold text-foreground">La cuenta</span>
          <div className="w-9" />
        </header>
      )}

      <AnimatePresence mode="wait">
        {/* SUMMARY */}
        {pageState === "summary" && (
          <motion.div
            key="summary"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="px-4 pt-4 pb-40"
          >
            <p className="text-sm font-bold text-muted-foreground mb-3">Todo lo que pediste</p>

            <div className="rounded-xl border border-border bg-card p-4 mb-4">
              {orders.map((order) => (
                <div key={order.id} className="mb-3 last:mb-0">
                  <p className="text-xs text-muted-foreground mb-1.5">
                    Pedido #{String(order.order_number).padStart(3, "0")} · {formatTime(order.confirmed_at)}
                  </p>
                  {order.items.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between py-0.5">
                      <span className="text-sm text-card-foreground">
                        {item.quantity}× {item.menu_item_name}
                      </span>
                      <span className="text-sm text-muted-foreground">{formatCLP(item.subtotal)}</span>
                    </div>
                  ))}
                  {order !== orders[orders.length - 1] && <hr className="my-2 border-border" />}
                </div>
              ))}

              <hr className="my-2 border-border" />
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-card-foreground">Subtotal</span>
                <span className="text-sm font-bold text-card-foreground">{formatCLP(subtotal)}</span>
              </div>
            </div>

            {/* Tip section */}
            <div className="mb-4">
              <p className="text-[15px] font-bold text-foreground mb-3">¿Quieres dejar propina?</p>

              <div className="grid grid-cols-4 gap-2 mb-3">
                {TIP_OPTIONS.map((opt, idx) => {
                  const isSelected = selectedTipIdx === idx && !customTip;
                  const tipVal = Math.round(subtotal * (opt.pct / 100));
                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        setSelectedTipIdx(idx);
                        setCustomTip("");
                      }}
                      className="flex flex-col items-center rounded-xl border-2 py-2.5 px-1 text-center transition-colors"
                      style={{
                        borderColor: isSelected ? primaryColor : "hsl(var(--border))",
                        backgroundColor: isSelected ? `${primaryColor}10` : "transparent",
                      }}
                    >
                      <span
                        className="text-sm font-semibold"
                        style={{ color: isSelected ? primaryColor : "hsl(var(--foreground))" }}
                      >
                        {opt.label}
                      </span>
                      {opt.pct > 0 && (
                        <span className="text-[11px] text-muted-foreground mt-0.5">{formatCLP(tipVal)}</span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Otro monto</label>
                <Input
                  type="number"
                  placeholder="$0"
                  value={customTip}
                  onChange={(e) => {
                    setCustomTip(e.target.value);
                    if (e.target.value) setSelectedTipIdx(null);
                  }}
                  className="h-11"
                />
              </div>
            </div>

            {/* Totals */}
            <div className="rounded-xl border border-border bg-card p-4 mb-4">
              {tipAmount > 0 && (
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-card-foreground">Propina</span>
                  <span className="text-sm text-card-foreground">{formatCLP(tipAmount)}</span>
                </div>
              )}
              <div className="flex items-center justify-between border-t-2 border-border pt-2">
                <span className="text-base font-bold text-card-foreground">TOTAL</span>
                <span className="text-xl font-bold" style={{ color: primaryColor }}>
                  {formatCLP(total)}
                </span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground text-center mb-6">
              El mozo llegará con la máquina de pago 💳
            </p>

            <hr className="my-5 border-border" />

            {/* Scan section */}
            <div className="text-center">
              <h2 className="text-lg font-bold text-foreground mb-1">Escanea para confirmar 🪪</h2>
              <p className="text-sm text-muted-foreground mb-5">Apunta al QR de la tarjeta de tu mesa</p>

              <div className="flex justify-center mb-5">
                <motion.div
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  className="relative h-32 w-32"
                >
                  <div className="absolute top-0 left-0 h-7 w-7 border-t-[3px] border-l-[3px] rounded-tl-md" style={{ borderColor: primaryColor }} />
                  <div className="absolute top-0 right-0 h-7 w-7 border-t-[3px] border-r-[3px] rounded-tr-md" style={{ borderColor: primaryColor }} />
                  <div className="absolute bottom-0 left-0 h-7 w-7 border-b-[3px] border-l-[3px] rounded-bl-md" style={{ borderColor: primaryColor }} />
                  <div className="absolute bottom-0 right-0 h-7 w-7 border-b-[3px] border-r-[3px] rounded-br-md" style={{ borderColor: primaryColor }} />
                  <div className="flex h-full w-full items-center justify-center text-4xl opacity-30">📱</div>
                </motion.div>
              </div>

              {cameraError && (
                <div className="mx-auto mb-4 max-w-[300px] rounded-xl bg-yellow-50 border border-yellow-200 p-3">
                  <p className="text-xs text-yellow-800 font-medium">
                    {cameraError === "camera_denied"
                      ? "Necesitamos acceso a la cámara. Habilita el permiso en la configuración de tu navegador."
                      : "Error al acceder a la cámara. Intenta de nuevo."}
                  </p>
                </div>
              )}

              <button
                onClick={startScanning}
                className="mx-auto flex items-center justify-center gap-2 rounded-2xl px-8 py-4 text-base font-semibold text-white shadow-lg transition-transform active:scale-[0.97]"
                style={{ backgroundColor: primaryColor, minHeight: "3.5rem" }}
              >
                <Camera className="h-5 w-5" />
                Pedir la cuenta →
              </button>
            </div>
          </motion.div>
        )}

        {/* SCANNING */}
        {pageState === "scanning" && (
          <motion.div
            key="scanning"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50"
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="absolute top-0 left-0 right-0 bg-black/60" style={{ height: "calc(50% - 130px)" }} />
              <div className="absolute bottom-0 left-0 right-0 bg-black/60" style={{ height: "calc(50% - 130px)" }} />
              <div className="absolute bg-black/60" style={{ top: "calc(50% - 130px)", bottom: "calc(50% - 130px)", left: 0, width: "calc(50% - 130px)" }} />
              <div className="absolute bg-black/60" style={{ top: "calc(50% - 130px)", bottom: "calc(50% - 130px)", right: 0, width: "calc(50% - 130px)" }} />

              <div className="relative h-[260px] w-[260px]">
                <div className="absolute top-0 left-0 h-10 w-10 border-t-[3px] border-l-[3px] rounded-tl" style={{ borderColor: primaryColor }} />
                <div className="absolute top-0 right-0 h-10 w-10 border-t-[3px] border-r-[3px] rounded-tr" style={{ borderColor: primaryColor }} />
                <div className="absolute bottom-0 left-0 h-10 w-10 border-b-[3px] border-l-[3px] rounded-bl" style={{ borderColor: primaryColor }} />
                <div className="absolute bottom-0 right-0 h-10 w-10 border-b-[3px] border-r-[3px] rounded-br" style={{ borderColor: primaryColor }} />
                <motion.div
                  className="absolute left-2 right-2 h-0.5 rounded-full"
                  style={{ backgroundColor: primaryColor }}
                  animate={{ top: ["10%", "90%", "10%"] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                />
              </div>
            </div>

            <div className="absolute bottom-32 left-0 right-0 text-center">
              <p className="text-white text-sm font-medium">Apunta al QR de la tarjeta de mesa</p>
            </div>

            <button
              onClick={cancelScanning}
              className="absolute bottom-12 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-white/20 backdrop-blur-sm px-6 py-3 text-sm font-semibold text-white"
            >
              <X className="h-4 w-4" /> Cancelar
            </button>
          </motion.div>
        )}

        {/* PROCESSING */}
        {pageState === "processing" && (
          <motion.div
            key="processing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background"
          >
            <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
            <p className="mt-4 text-base font-semibold text-foreground">Enviando solicitud...</p>
          </motion.div>
        )}

        {/* SUCCESS */}
        {pageState === "success" && (
          <motion.div
            key="success"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background px-6 text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="text-[80px] mb-4"
            >
              🧾
            </motion.div>
            <p className="text-xl font-bold text-foreground">¡La cuenta está en camino!</p>
            <p className="mt-1 text-sm text-muted-foreground">El mozo viene con la máquina de pago</p>
            <p className="mt-4 text-2xl font-bold" style={{ color: primaryColor }}>
              {formatCLP(finalTotal)}
            </p>
            {finalTip > 0 && (
              <p className="mt-1 text-sm text-muted-foreground">
                Propina sugerida: {formatCLP(finalTip)}
              </p>
            )}
            <p className="mt-4 text-xs text-muted-foreground">Puedes pagar en efectivo o con tarjeta</p>

            <AnimatePresence>
              {showBackBtn && (
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => navigate(`/${slug}`)}
                  className="mt-8 text-sm text-muted-foreground underline"
                >
                  Volver al inicio
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* ERROR */}
        {pageState === "error" && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center px-6 pt-20 text-center"
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-10 w-10 text-destructive" />
            </div>
            <p className="mt-4 text-base font-bold text-foreground">Error al pedir la cuenta</p>
            <p className="mt-1 text-sm text-muted-foreground max-w-[280px]">{errorMsg}</p>
            <button
              onClick={() => {
                setErrorMsg("");
                startScanning();
              }}
              className="mt-6 flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-semibold text-white"
              style={{ backgroundColor: primaryColor }}
            >
              <Camera className="h-4 w-4" /> Intentar de nuevo
            </button>
            <button
              onClick={() => navigate(`/${slug}/tracking${qs}`)}
              className="mt-3 text-sm text-muted-foreground underline"
            >
              Volver al tracking
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
