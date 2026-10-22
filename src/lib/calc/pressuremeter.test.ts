import { describe, expect, it } from "vitest";
import {
  computeGpbpFromVolume,
  runCalculations,
  validatePoints,
} from "./pressuremeter";
import type { WorkingPoint } from "@/lib/schema/pmt-v1";
import { defaultCalibration, defaultInterpretation } from "@/lib/schema/pmt-v1";

function pts(
  rows: { p: number; v: number; r?: number }[]
): WorkingPoint[] {
  return rows.map((row, i) => ({
    id: `pt-${i}`,
    index: i,
    pressureKPa: row.p,
    pressureMPa: row.p / 1000,
    volumeCm3: row.v,
    radiusMm: row.r ?? 36 + i * 0.2,
    status: "active" as const,
  }));
}

describe("pressuremeter calc", () => {
  it("nu raportează pMax ca rupere", () => {
    const points = pts([
      { p: 100, v: 0 },
      { p: 500, v: 10 },
      { p: 2000, v: 40 },
      { p: 5000, v: 80 },
    ]);
    const out = runCalculations({
      points,
      calibration: defaultCalibration(),
      interpretation: {
        ...defaultInterpretation(),
        apparatusLimitKPa: 5000,
        fitStartIdx: 1,
        fitEndIdx: 2,
      },
    });
    expect(out.interpretation.pMaxKPa).toBe(5000);
    expect(out.interpretation.rupturePressureKPa).toBeNull();
    expect(out.interpretation.apparatusLimitReachedWithoutRupture).toBe(true);
    const rupture = out.results.find((r) => r.key === "rupture");
    expect(rupture?.value).toBeNull();
  });

  it("calculează GPBP pozitiv pe pantă liniară (Formula 6)", () => {
    const points = pts([
      { p: 1000, v: 10, r: 38 },
      { p: 1500, v: 20, r: 38.5 },
      { p: 2000, v: 30, r: 39 },
      { p: 2500, v: 40, r: 39.5 },
    ]);
    const gpbp = computeGpbpFromVolume(points, 0, 3, 100);
    expect(gpbp).not.toBeNull();
    expect(gpbp!).toBeGreaterThan(0);
  });

  it("fără program emite GPBP_preview, nu module A/B", () => {
    const points = pts([
      { p: 1000, v: 10, r: 38 },
      { p: 1500, v: 20, r: 38.5 },
      { p: 2000, v: 30, r: 39 },
      { p: 2500, v: 40, r: 39.5 },
    ]);
    const out = runCalculations({
      points,
      calibration: defaultCalibration(),
      interpretation: {
        ...defaultInterpretation(),
        fitStartIdx: 0,
        fitEndIdx: 3,
      },
    });
    expect(out.results.some((r) => r.key === "GPBP_preview")).toBe(true);
    expect(out.results.some((r) => r.key === "GL1")).toBe(false);
  });

  it("punctele excluse nu intră în active validation empty", () => {
    const points = pts([{ p: 1, v: 0 }]).map((p) => ({
      ...p,
      status: "excluded" as const,
    }));
    expect(validatePoints(points).some((m) => m.includes("active"))).toBe(true);
  });

  it("după excludere, pMax se recalculează fără punctul exclus", () => {
    const points = pts([
      { p: 100, v: 0 },
      { p: 9000, v: 50 },
      { p: 500, v: 10 },
    ]);
    points[1].status = "excluded";
    const out = runCalculations({
      points,
      calibration: defaultCalibration(),
      interpretation: defaultInterpretation(),
    });
    expect(out.interpretation.pMaxKPa).toBe(500);
  });
});
