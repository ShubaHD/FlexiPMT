import { describe, expect, it } from "vitest";
import {
  computeKWinklerKNm3,
  derivedParamsFromGpbp,
  kWinklerResultFromGL1,
  parseRsMmFromVariables,
} from "./derived-params";

describe("derivedParamsFromGpbp", () => {
  it("calculează familia E / Kb / M / mv / λ / Kᵣ", () => {
    const rows = derivedParamsFromGpbp({
      sourceKey: "GUR1",
      G: 10,
      nu: 0.3,
      rsMm: 40,
    });
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));

    expect(byKey.EPBP_GUR1?.value).toBeCloseTo(2 * 10 * 1.3, 6);
    expect(byKey.Kr_GUR1?.value).toBeCloseTo((2 * 10) / 40, 6);
    expect(byKey.Kr_GUR1?.unit).toBe("MPa/mm");

    const E = byKey.EPBP_GUR1!.value!;
    expect(byKey.Kb_GUR1?.value).toBeCloseTo(E / (3 * (1 - 0.6)), 6);
    expect(byKey.E_plane_strain_GUR1?.value).toBeCloseTo(E / (1 - 0.09), 6);
    expect(byKey.M_GUR1?.value).toBeCloseTo(
      (E * 0.7) / (1.3 * 0.4),
      6
    );
    expect(byKey.mv_GUR1?.value).toBeCloseTo(1 / byKey.M_GUR1!.value!, 6);
    expect(byKey.lambda_GUR1?.value).toBeCloseTo(
      (E * 0.3) / (1.3 * 0.4),
      6
    );
  });

  it("omite Kb/M/λ când ν ≥ 0.5", () => {
    const rows = derivedParamsFromGpbp({
      sourceKey: "GL1",
      G: 5,
      nu: 0.5,
      rsMm: 35,
    });
    expect(rows.some((r) => r.key.startsWith("EPBP_"))).toBe(true);
    expect(rows.some((r) => r.key.startsWith("Kb_"))).toBe(false);
    expect(rows.some((r) => r.key.startsWith("M_"))).toBe(false);
    expect(rows.some((r) => r.key.startsWith("lambda_"))).toBe(false);
  });

  it("omite Kᵣ fără rs", () => {
    const rows = derivedParamsFromGpbp({
      sourceKey: "GL1",
      G: 5,
      nu: 0.25,
      rsMm: null,
    });
    expect(rows.some((r) => r.key.startsWith("Kr_"))).toBe(false);
    expect(rows.some((r) => r.key.startsWith("EPBP_"))).toBe(true);
  });
});

describe("parseRsMmFromVariables", () => {
  it("citește rs din Formula (5)", () => {
    expect(
      parseRsMmFromVariables("rs=37.500 mm; Δp [MPa]; Δδ [mm]; n=12")
    ).toBeCloseTo(37.5, 6);
  });
});

describe("computeKWinklerKNm3", () => {
  it("convertește rs mm→m și returnează kN/m³ (caz cunoscut)", () => {
    // E=10 MPa, rs=40 mm=0.04 m, ν=0 → k = 1000×10/(0.04×1) = 250_000 kN/m³
    expect(computeKWinklerKNm3(10, 40, 0)).toBeCloseTo(250_000, 6);

    // E=10 MPa, rs=40 mm, ν=0.3 → 1−ν²=0.91
    // k = 1000×10/(0.04×0.91) = 10000/0.0364 ≈ 274725.2747 kN/m³
    expect(computeKWinklerKNm3(10, 40, 0.3)).toBeCloseTo(
      10_000 / (0.04 * 0.91),
      6
    );
  });

  it("respinge ν cu |ν|≥1 (1−ν²≤0)", () => {
    expect(computeKWinklerKNm3(10, 40, 1)).toBeNull();
    expect(computeKWinklerKNm3(10, 40, -1)).toBeNull();
  });

  it("kWinklerResultFromGL1: etichetă raport + unități", () => {
    const r = kWinklerResultFromGL1({
      E_MPa: 10,
      rsMm: 40,
      nu: 0,
    });
    expect(r).not.toBeNull();
    expect(r!.key).toBe("kWinkler_GL1");
    expect(r!.label).toBe("Estimare Winkler derivată din GL1");
    expect(r!.unit).toBe("kN/m³");
    expect(r!.value).toBeCloseTo(250_000, 6);
    expect(r!.formula).toContain("k_W = E / [rs × (1 − ν²)]");
    expect(r!.variables).toMatch(/E=.*MPa/);
    expect(r!.variables).toMatch(/rs=40\.000 mm/);
    expect(r!.variables).toMatch(/ν=0/);
    expect(r!.note).toMatch(/nu e rezultat direct/i);
    expect(r!.reference).toMatch(/nu este definită de ISO/i);
  });
});
