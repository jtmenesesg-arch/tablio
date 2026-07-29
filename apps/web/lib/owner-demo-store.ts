import "server-only";

import { buildOwnerStory } from "@tablio/application";
import type { OwnerDashboard } from "./owner-contract";
import {
  creditDemoActor,
  tableCreditDemoStore,
} from "./table-credit-demo-store";
import { loyaltyDemoStore } from "./loyalty-demo-store";

export const OWNER_DEMO_TENANT_ID = creditDemoActor.tenantId;

type Sale = {
  tenantId: string;
  venueId: string;
  venueName: string;
  occurredAt: string;
  amountClp: number;
  tipClp: number;
  product: string;
  quantity: number;
  zone: string;
  tableId: string;
  round: number;
  paymentMethod: string;
};

const venueSeed = [
  { id: "bar-la-esquina", name: "Bar La Esquina" },
  { id: "patio-bellavista", name: "Patio Bellavista" },
] as const;

function seedSales(now: Date): Sale[] {
  const rows: Sale[] = [];
  const products = [
    ["Lager de la casa", "Terraza"],
    ["Hamburguesa clásica", "Salón"],
    ["Papas crujientes", "Terraza"],
    ["Spritz cítrico", "Patio"],
  ] as const;
  for (const venue of venueSeed) {
    for (let index = 0; index < 18; index += 1) {
      const [product, zone] = products[index % products.length]!;
      const hour = 17 + (index % 7);
      const occurred = new Date(now);
      occurred.setHours(hour, (index * 7) % 60, 0, 0);
      rows.push({
        tenantId: OWNER_DEMO_TENANT_ID,
        venueId: venue.id,
        venueName: venue.name,
        occurredAt: occurred.toISOString(),
        amountClp:
          venue.id === "bar-la-esquina"
            ? 48_000 + index * 900
            : 31_000 + index * 700,
        tipClp: 4_000 + index * 100,
        product,
        quantity: 1 + (index % 3),
        zone,
        tableId: `${venue.id}-table-${index % 7}`,
        round: 1 + (index % 3),
        paymentMethod: index % 4 === 0 ? "Efectivo" : "Tarjeta demo",
      });
    }
  }
  // Este dato de otro tenant prueba que el filtro ocurre antes de agregar.
  rows.push({
    tenantId: "00000000-0000-4000-8000-000000009999",
    venueId: "foreign-venue",
    venueName: "Local ajeno",
    occurredAt: now.toISOString(),
    amountClp: 99_999_999,
    tipClp: 0,
    product: "Dato prohibido",
    quantity: 1,
    zone: "Ajena",
    tableId: "foreign-table",
    round: 1,
    paymentMethod: "Ajeno",
  });
  return rows;
}

const percentChange = (current: number, previous: number) =>
  previous <= 0
    ? undefined
    : Math.round(((current - previous) / previous) * 100);

export class OwnerDemoStore {
  constructor(
    private readonly clock: () => Date = () => new Date(),
    private readonly sales: Sale[] = seedSales(clock()),
  ) {}

  dashboard(input: {
    tenantId: string;
    venueId?: string;
    newTenant?: boolean;
  }): OwnerDashboard {
    if (input.tenantId !== OWNER_DEMO_TENANT_ID) {
      throw new Error("El dueño no puede consultar otro tenant.");
    }
    const now = this.clock();
    const selectedVenueId = input.venueId ?? "all";
    if (
      selectedVenueId !== "all" &&
      !venueSeed.some((venue) => venue.id === selectedVenueId)
    ) {
      throw new Error("El local no pertenece al tenant activo.");
    }
    const tenantRows = this.sales.filter(
      (sale) =>
        sale.tenantId === input.tenantId &&
        (selectedVenueId === "all" || sale.venueId === selectedVenueId),
    );
    const rows = input.newTenant ? tenantRows.slice(0, 4) : tenantRows;
    const salesClp = rows.reduce((total, row) => total + row.amountClp, 0);
    const tipsClp = rows.reduce((total, row) => total + row.tipClp, 0);
    const byHour = new Map<string, number>();
    const byProduct = new Map<string, { quantity: number; salesClp: number }>();
    const byZone = new Map<string, number>();
    const byMethod = new Map<string, number>();
    for (const row of rows) {
      const hour =
        new Date(row.occurredAt)
          .toLocaleTimeString("es-CL", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })
          .slice(0, 2) + ":00";
      byHour.set(hour, (byHour.get(hour) ?? 0) + row.amountClp);
      const product = byProduct.get(row.product) ?? {
        quantity: 0,
        salesClp: 0,
      };
      product.quantity += row.quantity;
      product.salesClp += row.amountClp;
      byProduct.set(row.product, product);
      byZone.set(row.zone, (byZone.get(row.zone) ?? 0) + row.amountClp);
      byMethod.set(
        row.paymentMethod,
        (byMethod.get(row.paymentMethod) ?? 0) + row.amountClp,
      );
    }
    const peak = [...byHour.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const bestZone = [...byZone.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const credit = tableCreditDemoStore.bootstrap(creditDemoActor);
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const previous = new Date(currentYear, currentMonth - 1, 1);
    const monthlyLeakageClp = credit.losses
      .filter((loss) => {
        const date = new Date(loss.occurredAt);
        return (
          date.getMonth() === currentMonth && date.getFullYear() === currentYear
        );
      })
      .reduce((total, loss) => total + loss.amountClp, 0);
    const previousMonthlyLeakageClp = credit.losses
      .filter((loss) => {
        const date = new Date(loss.occurredAt);
        return (
          date.getMonth() === previous.getMonth() &&
          date.getFullYear() === previous.getFullYear()
        );
      })
      .reduce((total, loss) => total + loss.amountClp, 0);
    const unresolvedExceptions = input.newTenant ? 0 : 2;
    const historyStartsAt = input.newTenant
      ? now.toLocaleDateString("es-CL")
      : new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toLocaleDateString(
          "es-CL",
        );
    const story = buildOwnerStory({
      currentSalesClp: salesClp,
      comparableSalesClp: input.newTenant
        ? undefined
        : Math.round(salesClp / 1.18),
      bestZone,
      unresolvedExceptions,
      monthlyLeakageClp,
      previousMonthlyLeakageClp,
      historyStartsAt,
    });
    const loyaltyMetrics = loyaltyDemoStore.metrics();
    const products = [...byProduct.entries()].sort(
      (a, b) => b[1].quantity - a[1].quantity,
    );
    const distinctTables = new Set(rows.map((row) => row.tableId)).size;
    const rounds = new Set(rows.map((row) => `${row.tableId}:${row.round}`))
      .size;
    const venueComparison = venueSeed.map((venue) => {
      const venueRows = this.sales.filter(
        (sale) => sale.tenantId === input.tenantId && sale.venueId === venue.id,
      );
      return {
        venueId: venue.id,
        venueName: venue.name,
        salesClp: venueRows.reduce((total, row) => total + row.amountClp, 0),
        unresolvedExceptions: venue.id === "bar-la-esquina" ? 2 : 0,
      };
    });

    return {
      demo: true,
      tenant: { id: input.tenantId, name: "Grupo La Esquina" },
      selectedVenueId,
      venues: venueSeed.map((venue) => ({ ...venue })),
      period: {
        label: "Hoy",
        startsAt: new Date(now.setHours(0, 0, 0, 0)).toISOString(),
        endsAt: this.clock().toISOString(),
        historyStartsAt,
        comparisonAvailable: !input.newTenant,
        comparisonAppearsAt: input.newTenant
          ? new Date(
              this.clock().getTime() + 7 * 24 * 60 * 60 * 1000,
            ).toISOString()
          : undefined,
      },
      story,
      hourlySales: [...byHour.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([hour, amount]) => ({
          hour,
          salesClp: amount,
          isPeak: hour === peak,
        })),
      metrics: {
        salesClp,
        averageTicketClp:
          rows.length === 0 ? 0 : Math.round(salesClp / rows.length),
        roundsPerTable:
          distinctTables === 0
            ? 0
            : Math.round((rounds / distinctTables) * 10) / 10,
        tipsClp,
        unresolvedExceptions,
        monthlyLeakageClp,
        previousMonthlyLeakageClp,
        leakageTrendPercent: percentChange(
          monthlyLeakageClp,
          previousMonthlyLeakageClp,
        ),
        loyalty: {
          ...loyaltyMetrics,
          rewardKnownCostClp:
            loyaltyMetrics.rewardKnownCostClp > 0
              ? loyaltyMetrics.rewardKnownCostClp
              : undefined,
        },
      },
      topProducts: products.slice(0, 3).map(([name, value]) => ({
        name,
        ...value,
      })),
      lowRotationProducts: products
        .slice(-2)
        .map(([name, value]) => ({ name, quantity: value.quantity })),
      paymentMethods: [...byMethod.entries()].map(([name, amountClp]) => ({
        name,
        amountClp,
      })),
      venueComparison,
      unresolvedItems: input.newTenant
        ? []
        : [
            {
              id: "owner-exception-1",
              type: "exception",
              message: "Una liquidación no coincide con el abono esperado.",
              amountClp: 12_400,
            },
            ...credit.losses
              .filter((loss) => {
                const date = new Date(loss.occurredAt);
                return (
                  date.getMonth() === currentMonth &&
                  date.getFullYear() === currentYear
                );
              })
              .map((loss) => ({
                id: loss.id,
                type: "credit_loss" as const,
                message: `Fuga de crédito: ${loss.reason}`,
                amountClp: loss.amountClp,
              })),
          ],
      serverTime: this.clock().toISOString(),
    };
  }

  exportCsv(input: { tenantId: string; venueId?: string }): string {
    const dashboard = this.dashboard(input);
    const rows = [
      ["metrica", "valor_clp"],
      ["ventas", dashboard.metrics.salesClp.toString()],
      ["ticket_promedio", dashboard.metrics.averageTicketClp.toString()],
      ["propinas", dashboard.metrics.tipsClp.toString()],
      ["fuga_credito_mes", dashboard.metrics.monthlyLeakageClp.toString()],
    ];
    return rows.map((row) => row.join(",")).join("\n") + "\n";
  }
}

const shared = globalThis as typeof globalThis & {
  __tablioOwnerDemoStore?: OwnerDemoStore;
};
export const ownerDemoStore =
  shared.__tablioOwnerDemoStore ?? new OwnerDemoStore();
shared.__tablioOwnerDemoStore = ownerDemoStore;
