export type PlanCode = "starter" | "flow" | "high_flow" | "custom";

export type VenueSize = Readonly<{
  tables: number;
  zones: number;
  stations: number;
}>;

export type PlanDefinition = Readonly<{
  code: PlanCode;
  name: string;
  monthlyClp?: number;
  setupClp?: number;
  maxTables?: number;
  generousZoneLimit?: number;
  generousStationLimit?: number;
}>;

export const PLAN_CATALOG: readonly PlanDefinition[] = Object.freeze([
  {
    code: "starter",
    name: "Inicial",
    monthlyClp: 99_000,
    setupClp: 199_000,
    maxTables: 12,
    generousZoneLimit: 4,
    generousStationLimit: 4,
  },
  {
    code: "flow",
    name: "Flujo",
    monthlyClp: 169_000,
    setupClp: 249_000,
    maxTables: 30,
    generousZoneLimit: 8,
    generousStationLimit: 6,
  },
  {
    code: "high_flow",
    name: "Alto flujo",
    monthlyClp: 239_000,
    setupClp: 299_000,
    maxTables: 60,
    generousZoneLimit: 12,
    generousStationLimit: 10,
  },
  { code: "custom", name: "Personalizado" },
]);

function nonNegativeInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value;
}

export function recommendPlan(size: VenueSize): PlanDefinition {
  const tables = nonNegativeInteger(size.tables, "tables");
  const zones = nonNegativeInteger(size.zones, "zones");
  const stations = nonNegativeInteger(size.stations, "stations");
  const tableIndex = tables <= 12 ? 0 : tables <= 30 ? 1 : tables <= 60 ? 2 : 3;
  if (tableIndex === 3) return PLAN_CATALOG[3]!;

  const tablePlan = PLAN_CATALOG[tableIndex]!;
  const layoutClearlyExceeds =
    zones > tablePlan.generousZoneLimit! &&
    stations > tablePlan.generousStationLimit!;
  return PLAN_CATALOG[
    Math.min(tableIndex + (layoutClearlyExceeds ? 1 : 0), 3)
  ]!;
}

export function nextPlanEffectiveAt(currentPeriodEnd: string): string {
  const date = new Date(currentPeriodEnd);
  if (Number.isNaN(date.getTime()))
    throw new Error("Invalid billing period end");
  return date.toISOString();
}
