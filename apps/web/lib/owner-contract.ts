export type OwnerDashboard = Readonly<{
  demo: true;
  tenant: { id: string; name: string };
  selectedVenueId: "all" | string;
  venues: readonly { id: string; name: string }[];
  period: {
    label: string;
    startsAt: string;
    endsAt: string;
    historyStartsAt: string;
    comparisonAvailable: boolean;
    comparisonAppearsAt?: string;
  };
  story: {
    headline: string;
    attention: string;
    improved: string;
    recommendation: string;
    historyMessage?: string;
  };
  hourlySales: readonly {
    hour: string;
    salesClp: number;
    isPeak: boolean;
  }[];
  metrics: {
    salesClp: number;
    averageTicketClp: number;
    roundsPerTable: number;
    tipsClp: number;
    unresolvedExceptions: number;
    monthlyLeakageClp: number;
    previousMonthlyLeakageClp: number;
    leakageTrendPercent?: number;
  };
  topProducts: readonly { name: string; quantity: number; salesClp: number }[];
  lowRotationProducts: readonly { name: string; quantity: number }[];
  paymentMethods: readonly { name: string; amountClp: number }[];
  venueComparison: readonly {
    venueId: string;
    venueName: string;
    salesClp: number;
    unresolvedExceptions: number;
  }[];
  unresolvedItems: readonly {
    id: string;
    type: "exception" | "credit_loss";
    message: string;
    amountClp: number;
  }[];
  serverTime: string;
}>;
