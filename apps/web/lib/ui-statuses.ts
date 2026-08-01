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
