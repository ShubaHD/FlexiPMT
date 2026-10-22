/**
 * Smoke pe fixture-uri LOCALE disponibile — NU sunt fișierele de referință FlexiPMT.
 * Sursă: fixtures/available-substitutes/SOURCE.md
 *
 * Referința (Hole 60785 / C20260915) → reference-regression.test.ts
 */
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { parseElastLoggerCsv } from "./elast-csv";
import { compareFactors, parseCalibrationCsv } from "./calibration-csv";
import { recomputePayload } from "@/lib/payload";
import {
  emptyPayload,
  rawToWorking,
  missingRequiredFields,
} from "@/lib/schema/pmt-v1";

const DIR = path.join(process.cwd(), "fixtures", "available-substitutes");

function load(name: string) {
  return readFileSync(path.join(DIR, name), "utf-8");
}

describe("available-substitutes (NU referință FlexiPMT)", () => {
  it("IP43A_000ELAST: Hole IP43A, 105 puncte — surogat local", () => {
    const r = parseElastLoggerCsv(load("IP43A_000ELAST.CSV"), "IP43A_000ELAST.CSV");
    expect(r.metadata.holeNo).toBe("IP43A");
    expect(r.metadata.dataSize).toBe(105);
    expect(r.devicePoints.length).toBe(105);
    // Confirmă că NU e referința 60785
    expect(r.metadata.holeNo).not.toBe("60785");
    expect(r.metadata.dataSize).not.toBe(102);
  });

  it("BH01_002ELAST_as_001: Hole BH01_, 105 puncte — surogat local", () => {
    const r = parseElastLoggerCsv(
      load("BH01_002ELAST_as_001.CSV"),
      "BH01_002ELAST_as_001.CSV"
    );
    expect(r.metadata.holeNo).toBe("BH01_");
    expect(r.devicePoints.length).toBe(105);
    expect(r.metadata.holeNo).not.toBe("60785");
  });

  it("C20260201 KP/GA: smoke calibrare (nu C20260915)", () => {
    const kp = parseCalibrationCsv(
      load("C20260201_155023_KP.CSV"),
      "C20260201_155023_KP.CSV"
    );
    const ga = parseCalibrationCsv(
      load("C20260201_160209_GA.CSV"),
      "C20260201_160209_GA.CSV"
    );
    expect(kp.kind).toBe("KP");
    expect(ga.kind).toBe("GA");
    expect(kp.fileName).not.toContain("C20260915");
  });

  it("flux smoke: import → exclude → recalcul pe surogat IP43A", () => {
    const parsed = parseElastLoggerCsv(
      load("IP43A_000ELAST.CSV"),
      "IP43A_000ELAST.CSV"
    );
    let payload = emptyPayload();
    payload.rawPoints = parsed.rawPoints.map((p) => ({ ...p }));
    payload.workingPoints = rawToWorking(parsed.rawPoints);
    payload.calibration.correctionsAlreadyApplied = true;
    const p0 = payload.rawPoints[0].pressureMPa;
    payload = recomputePayload(payload).payload;
    const target = payload.workingPoints[10];
    payload.workingPoints = payload.workingPoints.map((p) =>
      p.id === target.id
        ? { ...p, status: "excluded" as const, excludeReason: "smoke" }
        : p
    );
    payload = recomputePayload(payload).payload;
    expect(payload.rawPoints[0].pressureMPa).toBe(p0);
    expect(missingRequiredFields(payload).length).toBeGreaterThan(0);

    const kp = parseCalibrationCsv(
      load("C20260201_155023_KP.CSV"),
      "C20260201_155023_KP.CSV"
    );
    expect(
      compareFactors(parsed.metadata.factors, kp.factors).length
    ).toBeGreaterThan(0);
  });
});
