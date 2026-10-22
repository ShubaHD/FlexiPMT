import { describe, expect, it } from "vitest";
import { parseElastLoggerCsv } from "./elast-csv";
import { importOyoJson } from "./oyo-json";
import fixture from "../../../fixtures/test_OYOshubaa.flexipmt.json";

const sample = `Elast Logger 3
File ID, 003
Date, 2026-04-08
Time, 17:44:21
Hole No., BH-34
Depth[m], 59.9
Data size, 3
Tube type, NXH
Factor A(1), 792.478
Factor A(2), -0.553
Factor G, -4.403
Factor dRi(A), 2.030

Number,Pass time[hh:mm:ss], Pressure[MPa], dRi[mm], R[mm]
0, 00:00:00, 0.512, -1.382, 36.006
1, 00:01:07, 0.681, -1.020, 36.206
2, 00:01:19, 0.759, -0.660, 36.408
`;

describe("elast csv import", () => {
  it("păstrează punctele brute, factorii și derivă volum", () => {
    const r = parseElastLoggerCsv(sample, "003ELAST.CSV.xls");
    expect(r.rawPoints.length).toBe(3);
    expect(r.devicePoints.length).toBe(3);
    expect(r.metadata.holeNo).toBe("BH-34");
    expect(r.metadata.depthM).toBe(59.9);
    expect(r.metadata.dataSize).toBe(3);
    expect(r.metadata.factors.factorA1).toBeCloseTo(792.478, 3);
    expect(r.rawPoints[0].pressureKPa).toBeCloseTo(512, 0);
    expect(r.rawPoints[1].volumeCm3).toBeGreaterThan(0);
    expect(r.summary.correctionsAlreadyApplied).toBe(true);
    expect(r.firstReading?.pressureMPa).toBeCloseTo(0.512, 3);
    expect(r.lastReading?.pressureMPa).toBeCloseTo(0.759, 3);
  });

  it("semnalează Data size ≠ număr puncte", () => {
    const bad = sample.replace("Data size, 3", "Data size, 99");
    const r = parseElastLoggerCsv(bad, "x.csv");
    expect(
      r.summary.warnings.some((w) => w.includes("Data size") && w.includes("99"))
    ).toBe(true);
  });
});

describe("oyo json import", () => {
  it("importă fixture migrată fără a seta rupere din pL", () => {
    const r = importOyoJson(fixture as never, "test_OYOshubaa.flexipmt.json");
    expect(r.payload.rawPoints.length).toBe(108);
    expect(r.payload.workingPoints.length).toBe(108);
    expect(r.summary.correctionsAlreadyApplied).toBe(true);
    expect(r.payload.interpretation.rupturePressureKPa).toBeNull();
    expect(
      r.summary.warnings.some((w) => w.includes("pL") || w.includes("pMax"))
    ).toBe(true);
  });
});
