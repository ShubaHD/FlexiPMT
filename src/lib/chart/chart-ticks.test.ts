import { describe, expect, it } from "vitest";
import {
  autoMajorStep,
  clampMajorStep,
  formatAxisTick,
  minorTicksBetween,
  niceStep,
  normalizeChartTickSettings,
  resolveAxisTicks,
  tickDecimalPlaces,
  ticksFromStep,
} from "@/lib/chart/chart-ticks";

describe("chart-ticks", () => {
  it("niceStep folosește 1/2/5 × 10^n", () => {
    expect(niceStep(0.12)).toBe(0.2);
    expect(niceStep(0.3)).toBe(0.5);
    expect(niceStep(3.2)).toBe(5);
    expect(niceStep(12)).toBe(20);
  });

  it("autoMajorStep produce un pas rezonabil pe domeniu", () => {
    const step = autoMajorStep(35, 42, 7);
    expect(step).toBeGreaterThan(0);
    expect(step).toBeLessThanOrEqual(2);
  });

  it("ticksFromStep aliniază la pas", () => {
    expect(ticksFromStep(35.1, 38.4, 0.5)).toEqual([
      35.5, 36, 36.5, 37, 37.5, 38,
    ]);
  });

  it("minorTicksBetween împarte intervalul major", () => {
    const minor = minorTicksBetween([0, 1], 1, 5, 0, 1);
    expect(minor).toEqual([0.2, 0.4, 0.6, 0.8]);
  });

  it("formatAxisTick respectă pasul", () => {
    expect(tickDecimalPlaces(0.1)).toBe(1);
    expect(tickDecimalPlaces(0.05)).toBe(2);
    expect(formatAxisTick(1.2, 0.1)).toBe("1.2");
    expect(formatAxisTick(20, 5)).toBe("20.0");
  });

  it("custom 0.5 mm / 0.1 MPa pe domeniu tipic p–R", () => {
    const x = resolveAxisTicks(35, 42, {
      mode: "custom",
      majorStep: 0.5,
    });
    expect(x.step).toBe(0.5);
    expect(x.major[0]).toBeGreaterThanOrEqual(35);
    expect(x.minor.length).toBeGreaterThan(0);

    const y = resolveAxisTicks(0, 2.5, {
      mode: "custom",
      majorStep: 0.1,
    });
    expect(y.step).toBe(0.1);
    expect(formatAxisTick(y.major[1]!, y.step)).toMatch(/^\d+\.\d$/);
  });

  it("clampMajorStep evită etichete aglomerate", () => {
    const stepped = clampMajorStep(0, 100, 0.1, 16);
    expect(stepped).toBeGreaterThan(0.1);
  });

  it("normalizeChartTickSettings are default auto", () => {
    const n = normalizeChartTickSettings(undefined);
    expect(n.x.mode).toBe("auto");
    expect(n.y.mode).toBe("auto");
    const c = normalizeChartTickSettings({
      x: { mode: "custom", majorStep: 0.5 },
      y: { mode: "custom", majorStep: 0.1 },
    });
    expect(c.x).toEqual({ mode: "custom", majorStep: 0.5 });
    expect(c.y).toEqual({ mode: "custom", majorStep: 0.1 });
  });
});
