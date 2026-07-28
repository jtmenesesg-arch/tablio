import { describe, expect, it } from "vitest";
import { createDinerAlias, DINER_ALIAS_WORDS } from "./diner-alias";

const TYPICAL_BAR_VOCABULARY = [
  "cerveza",
  "lager",
  "ipa",
  "stout",
  "schop",
  "pisco",
  "sour",
  "spritz",
  "mojito",
  "piscola",
  "ron",
  "gin",
  "vodka",
  "whisky",
  "tequila",
  "vino",
  "copa",
  "botella",
  "jarra",
  "vaso",
  "trago",
  "cóctel",
  "bebida",
  "agua",
  "jugo",
  "hamburguesa",
  "pizza",
  "papas",
  "empanada",
  "chorrillana",
  "tabla",
  "completo",
  "sándwich",
  "ensalada",
  "ceviche",
  "alitas",
  "nachos",
  "cocina",
  "barra",
  "bebestibles",
  "postres",
  "compartir",
] as const;

function normalize(word: string): string {
  return word
    .normalize("NFD")
    .replaceAll(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es");
}

describe("alias de comensal", () => {
  it("no usa palabras que puedan confundirse con una categoría o producto típico de bar", () => {
    // Este test intenta romper la entrega: si falla, el garzón podría gritar
    // un alias que suena igual que un producto o una comanda.
    const forbidden = new Set(TYPICAL_BAR_VOCABULARY.map(normalize));
    expect(
      DINER_ALIAS_WORDS.filter((word) => forbidden.has(normalize(word))),
    ).toEqual([]);
  });

  it("evita repetir un alias que ya está activo en la mesa", () => {
    // Este test intenta crear dos personas indistinguibles en la misma mesa.
    const first = createDinerAlias("dispositivo-1", new Set());
    const second = createDinerAlias("dispositivo-1", new Set([first]));
    expect(second).not.toBe(first);
  });
});
