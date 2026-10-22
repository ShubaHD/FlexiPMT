import { describe, expect, it } from "vitest";
import {
  chartXValue,
  geometricContactMarker,
} from "@/lib/chart/chart-axis";

describe("chart-axis", () => {
  const pt = { radiusMm: 38, volumeCm3: 100 };

  it("p–R / p–D / p–ΔV nu modifică R original", () => {
    expect(chartXValue(pt, "p_R")).toBe(38);
    expect(chartXValue(pt, "p_D")).toBe(76);
    expect(chartXValue(pt, "p_dV")).toBe(100);
    expect(pt.radiusMm).toBe(38);
  });

  it("contact geometric doar cu diametru și R", () => {
    expect(geometricContactMarker("p_dV", 76, true)).toBeNull();
    const miss = geometricContactMarker("p_R", null, true);
    expect(miss && "missing" in miss).toBe(true);
    const okR = geometricContactMarker("p_R", 76, true);
    expect(okR && "x" in okR && okR.x).toBe(38);
    const okD = geometricContactMarker("p_D", 76, true);
    expect(okD && "x" in okD && okD.x).toBe(76);
  });
});
