export type StatusPresentation = Readonly<{
  label: string;
  tone: "danger" | "neutral" | "success" | "warning";
}>;

export const tableStatusDictionary = {
  available: { label: "Libre", tone: "success" },
  occupied: { label: "Ocupada", tone: "warning" },
  waiting_payment: { label: "Esperando pago", tone: "danger" },
  paused: { label: "En pausa", tone: "neutral" },
} as const satisfies Record<string, StatusPresentation>;

export const qrStatusDictionary = {
  active: { label: "Activo", tone: "success" },
  revoked: { label: "Revocado", tone: "danger" },
} as const satisfies Record<string, StatusPresentation>;

export const cashierTableStatusDictionary = {
  free: { label: "Libre", tone: "neutral" },
  active: { label: "Activa", tone: "success" },
  new_orders: { label: "Pedidos nuevos", tone: "success" },
  preparing: { label: "Preparando", tone: "warning" },
  requires_delivery: { label: "Requiere entrega", tone: "warning" },
  requires_attention: { label: "Requiere atención", tone: "danger" },
  inactive: { label: "Inactiva", tone: "neutral" },
  closed: { label: "Cerrada", tone: "neutral" },
} as const satisfies Record<string, StatusPresentation>;

export const exceptionPriorityDictionary = {
  normal: { label: "Normal", tone: "neutral" },
  high: { label: "Alta", tone: "warning" },
  critical: { label: "Crítica", tone: "danger" },
} as const satisfies Record<string, StatusPresentation>;

export const exceptionStatusDictionary = {
  open: { label: "Abierta", tone: "danger" },
  in_review: { label: "En revisión", tone: "warning" },
  resolved: { label: "Resuelta", tone: "success" },
  escalated: { label: "Escalada", tone: "warning" },
} as const satisfies Record<string, StatusPresentation>;

export const reconciliationStatusDictionary = {
  matched: { label: "Cuadra", tone: "success" },
  difference: { label: "Diferencia", tone: "danger" },
  pending: { label: "Pendiente", tone: "neutral" },
} as const satisfies Record<string, StatusPresentation>;

export const taxDocumentStatusDictionary = {
  issued: { label: "Emitida", tone: "success" },
  voucher: { label: "Voucher electrónico", tone: "neutral" },
  failed: { label: "Fallida", tone: "danger" },
  pending: { label: "Pendiente", tone: "warning" },
  review: { label: "Revisión", tone: "warning" },
} as const satisfies Record<string, StatusPresentation>;

export const taxProviderStatusDictionary = {
  working: { label: "Funcionando", tone: "success" },
  degraded: { label: "Degradado", tone: "warning" },
  down: { label: "Caído", tone: "danger" },
  unknown: { label: "Sin datos", tone: "neutral" },
} as const satisfies Record<string, StatusPresentation>;

export const tableCreditAccountStatusDictionary = {
  open: { label: "Abierta", tone: "warning" },
  bill_requested: { label: "Cuenta solicitada", tone: "warning" },
  expired: { label: "Vencida", tone: "danger" },
  settled: { label: "Saldada", tone: "success" },
  closed_with_loss: { label: "Cerrada con fuga", tone: "danger" },
} as const satisfies Record<string, StatusPresentation>;

export const storedValueAccountStatusDictionary = {
  active: { label: "Activa", tone: "success" },
  frozen_for_recovery: { label: "Congelada por recuperación", tone: "warning" },
  wind_down: { label: "Cierre gradual", tone: "warning" },
} as const satisfies Record<string, StatusPresentation>;

export const subscriptionStatusDictionary = {
  trialing: { label: "Prueba", tone: "neutral" },
  active: { label: "Al día", tone: "success" },
  past_due: { label: "Cobro fallido", tone: "danger" },
  grace: { label: "En gracia", tone: "warning" },
  admin_restricted: { label: "Administración restringida", tone: "warning" },
  suspension_scheduled: { label: "Suspensión agendada", tone: "warning" },
  suspended: { label: "Suspendido", tone: "danger" },
  cancelled: { label: "Cancelado", tone: "neutral" },
} as const satisfies Record<string, StatusPresentation>;

export const presenceLevelDictionary = {
  printed_with_qr: {
    label: "Código en la tarjeta",
    description:
      "Es lo más simple. Protege contra links reenviados, pero una foto muestra el QR y el código.",
  },
  separate: {
    label: "Código separado",
    description:
      "La tarjeta muestra solo el QR. El código se entrega aparte para reducir el riesgo de una foto.",
  },
  rotating: {
    label: "Código rotativo",
    description:
      "Cambia cada día o turno. Protege más, pero el equipo debe comunicar el código vigente.",
  },
} as const;
