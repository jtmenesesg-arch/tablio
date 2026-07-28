const ALIAS_SUBJECTS = [
  "Zorro",
  "Puma",
  "Búho",
  "Cóndor",
  "Lince",
  "Coipo",
  "Huemul",
  "Faro",
  "Mapa",
  "Brújula",
  "Cometa",
  "Trompo",
  "Cuaderno",
  "Linterna",
] as const;

const ALIAS_COLORS = [
  "Azul",
  "Verde",
  "Violeta",
  "Coral",
  "Turquesa",
  "Índigo",
] as const;

export const DINER_ALIAS_WORDS = Object.freeze([
  ...ALIAS_SUBJECTS,
  ...ALIAS_COLORS,
]);

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (const character of seed) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function aliasCandidates(seed: string): readonly string[] {
  const offset = hashSeed(seed);
  const combinations = ALIAS_SUBJECTS.flatMap((subject) =>
    ALIAS_COLORS.map((color) => `${subject} ${color}`),
  );
  return combinations.map(
    (_, index) => combinations[(offset + index) % combinations.length],
  );
}

export function createDinerAlias(
  seed: string,
  aliasesInUse: ReadonlySet<string>,
): string {
  const available = aliasCandidates(seed).find(
    (candidate) => !aliasesInUse.has(candidate),
  );
  if (!available) {
    return `Zorro Azul ${aliasesInUse.size + 1}`;
  }
  return available;
}
