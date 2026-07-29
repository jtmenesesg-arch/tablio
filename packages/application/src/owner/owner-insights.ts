export type OwnerComparisonInput = Readonly<{
  currentSalesClp: number;
  comparableSalesClp?: number;
  bestZone?: string;
  unresolvedExceptions: number;
  monthlyLeakageClp: number;
  previousMonthlyLeakageClp?: number;
  historyStartsAt: string;
}>;

export type OwnerStory = Readonly<{
  headline: string;
  attention: string;
  improved: string;
  recommendation: string;
  historyMessage?: string;
}>;

const money = (value: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);

export function buildOwnerStory(input: OwnerComparisonInput): OwnerStory {
  if (
    !Number.isSafeInteger(input.currentSalesClp) ||
    input.currentSalesClp < 0 ||
    !Number.isSafeInteger(input.monthlyLeakageClp) ||
    input.monthlyLeakageClp < 0
  ) {
    throw new Error("Owner metrics must be non-negative CLP integers");
  }
  const hasComparison =
    input.comparableSalesClp !== undefined && input.comparableSalesClp > 0;
  const salesChange = hasComparison
    ? Math.round(
        ((input.currentSalesClp - input.comparableSalesClp!) /
          input.comparableSalesClp!) *
          100,
      )
    : undefined;
  const headline = hasComparison
    ? `Vendiste ${money(input.currentSalesClp)}, ${Math.abs(salesChange!)}% ${
        salesChange! >= 0 ? "más" : "menos"
      } que el período comparable.${
        input.bestZone ? ` ${input.bestZone} fue tu mejor zona.` : ""
      }`
    : `Hoy llevas ${money(input.currentSalesClp)} en ventas.${
        input.bestZone ? ` ${input.bestZone} lidera por ahora.` : ""
      }`;

  const leakTrend =
    input.previousMonthlyLeakageClp !== undefined &&
    input.previousMonthlyLeakageClp > 0
      ? Math.round(
          ((input.monthlyLeakageClp - input.previousMonthlyLeakageClp) /
            input.previousMonthlyLeakageClp) *
            100,
        )
      : undefined;

  return {
    headline,
    attention:
      input.unresolvedExceptions > 0
        ? `${input.unresolvedExceptions} excepciones necesitan una decisión.`
        : "No hay excepciones sin resolver.",
    improved:
      salesChange === undefined
        ? "Estamos construyendo una base para comparar tu desempeño."
        : salesChange >= 0
          ? `Las ventas mejoraron ${salesChange}% frente al período comparable.`
          : `La comparación bajó ${Math.abs(salesChange)}%; revisa el horario del peak.`,
    recommendation:
      input.monthlyLeakageClp === 0
        ? "El crédito de mesa no registra fugas este mes."
        : `El crédito de mesa ha costado ${money(
            input.monthlyLeakageClp,
          )} este mes${
            leakTrend === undefined
              ? ""
              : ` (${Math.abs(leakTrend)}% ${
                  leakTrend <= 0 ? "menos" : "más"
                } que el mes anterior)`
          }. Evalúa reducir límites o volver a prepago puro.`,
    historyMessage: hasComparison
      ? undefined
      : `Las comparaciones aparecerán cuando exista un período equivalente. Guardamos historia desde ${input.historyStartsAt}.`,
  };
}
