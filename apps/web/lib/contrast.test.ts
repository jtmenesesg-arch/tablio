import { describe, expect, it } from "vitest";

function luminance(hex: string): number {
  const [red, green, blue] =
    hex
      .match(/.{2}/g)
      ?.map((channel) => Number.parseInt(channel, 16) / 255)
      .map((channel) =>
        channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4,
      ) ?? [];
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground: string, background: string): number {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

describe("contraste de la marca en la PWA", () => {
  it.each([
    ["texto principal", "111110", "F8F7F3"],
    ["botón naranja", "111110", "E8531D"],
    ["naranja oscuro", "FEFEFE", "B83E10"],
    ["éxito", "FEFEFE", "1A6B45"],
    ["error", "FEFEFE", "C0280F"],
    ["aviso", "111110", "B87C10"],
  ])("%s supera AA para texto normal", (_label, foreground, background) => {
    // Este test intenta volver ilegible una acción o mensaje. Si falla, texto
    // importante podría desaparecer con poca luz o en una pantalla económica.
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it("el naranja con blanco queda reservado a iconos o texto grande", () => {
    // Este test protege el límite de 3:1 para marca grande y controles gráficos.
    expect(contrast("FEFEFE", "E8531D")).toBeGreaterThanOrEqual(3);
  });
});
