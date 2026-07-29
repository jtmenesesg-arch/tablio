export type LoyaltyProgram = Readonly<{
  enabled: boolean;
  visitsRequired: number;
  minimumEligibleClp: number;
  maxVisitsPerDay: number;
  rewardProductId: string;
}>;

export type RewardEconomics = Readonly<{
  referenceValueClp: number;
  knownCostClp?: number;
  marginClp?: number;
  explanation: string;
}>;

export function assertExplicitLoyaltyConsent(input: {
  identificationAccepted: boolean;
  contactAccepted: boolean;
}): void {
  if (!input.identificationAccepted) {
    throw new Error("Debes aceptar que el local recuerde tus visitas.");
  }
  if (!input.contactAccepted) {
    throw new Error(
      "El teléfono o correo es necesario para recuperar tus sellos.",
    );
  }
}

export function maskLoyaltyRecognition(programAlias: string): string {
  const suffix = programAlias.match(/\d{2,4}$/)?.[0];
  return suffix ? `Perfil •${suffix.slice(-3)}` : "Perfil reconocido";
}

export function eligibleStampCount(input: {
  program: LoyaltyProgram;
  confirmedServerSide: boolean;
  paidAmountClp: number;
  visitsAlreadyToday: number;
}): number {
  if (
    !input.program.enabled ||
    !input.confirmedServerSide ||
    input.paidAmountClp < input.program.minimumEligibleClp ||
    input.visitsAlreadyToday >= input.program.maxVisitsPerDay
  ) {
    return 0;
  }
  return 1;
}

export function rewardEconomics(input: {
  referenceValueClp: number;
  optionalUnitCostClp?: number;
}): RewardEconomics {
  if (input.optionalUnitCostClp === undefined) {
    return {
      referenceValueClp: input.referenceValueClp,
      explanation:
        "Valor de referencia según precio de lista. El local no informó costo; no se calcula margen.",
    };
  }
  return {
    referenceValueClp: input.referenceValueClp,
    knownCostClp: input.optionalUnitCostClp,
    marginClp: input.referenceValueClp - input.optionalUnitCostClp,
    explanation: "Costo informado por el local y valor de lista congelados.",
  };
}

export function identityLossRate(input: {
  recognizedAttempts: number;
  recoveredAfterMissingCredential: number;
}): number {
  if (input.recognizedAttempts <= 0) return 0;
  return (
    Math.round(
      (input.recoveredAfterMissingCredential / input.recognizedAttempts) *
        10_000,
    ) / 100
  );
}

export function canRedeemReward(input: {
  program: LoyaltyProgram;
  stampBalance: number;
  rewardAvailable: boolean;
}): boolean {
  return (
    input.program.enabled &&
    input.stampBalance >= input.program.visitsRequired &&
    input.rewardAvailable
  );
}

export function favoriteSuggestion<T extends { available: boolean }>(
  history: readonly T[],
): T | undefined {
  return history.find((item) => item.available);
}

export function refundLoyaltyEffect(input: {
  eligibleAmountClp: number;
  netPaidAfterRefundClp: number;
  visitPreviouslyGranted: boolean;
  rewardRedeemed: boolean;
}): Readonly<{
  reverseVisit: boolean;
  restoreReward: boolean;
}> {
  return {
    reverseVisit:
      input.visitPreviouslyGranted &&
      input.netPaidAfterRefundClp < input.eligibleAmountClp,
    restoreReward: input.rewardRedeemed && input.netPaidAfterRefundClp === 0,
  };
}
