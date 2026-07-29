import { describe, expect, it } from "vitest";
import { buildOwnerStory } from "./owner-insights";

describe("owner story", () => {
  it("cuenta una historia respaldada por una comparación explícita", () => {
    const story = buildOwnerStory({
      currentSalesClp: 1_180_000,
      comparableSalesClp: 1_000_000,
      bestZone: "Terraza",
      unresolvedExceptions: 2,
      monthlyLeakageClp: 45_000,
      previousMonthlyLeakageClp: 60_000,
      historyStartsAt: "1 de julio",
    });
    expect(story.headline).toContain("18% más");
    expect(story.attention).toContain("2 excepciones");
    expect(story.recommendation).toContain("25% menos");
    expect(story.historyMessage).toBeUndefined();
  });

  it("un tenant nuevo muestra valor actual y explica cuándo comparará", () => {
    const story = buildOwnerStory({
      currentSalesClp: 284_000,
      bestZone: "Salón",
      unresolvedExceptions: 0,
      monthlyLeakageClp: 0,
      historyStartsAt: "hoy",
    });
    expect(story.headline).toContain("Hoy llevas");
    expect(story.historyMessage).toContain("desde hoy");
    expect(story.headline).not.toContain("datos insuficientes");
  });
});
