/**
 * Regresie import/calcul pe CSV-urile Elast de referință (Hole 60785).
 * Nu depinde de numele sau conținutul fișierelor KP/GA.
 */
import { existsSync, readFileSync, readdirSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { parseElastLoggerCsv } from "./elast-csv";
import { parseCalibrationCsv } from "./calibration-csv";
import {
  associateCalibrationDocument,
  resultsFingerprint,
} from "./associate-calibration";
import { recomputePayload } from "@/lib/payload";
import { emptyPayload, rawToWorking } from "@/lib/schema/pmt-v1";

const REF = path.join(process.cwd(), "fixtures", "reference");

const ELAST = {
  elast000: "000ELAST.CSV",
  elast001: "001ELAST.CSV",
} as const;

function refPath(name: string) {
  return path.join(REF, name);
}

function loadElast(name: string) {
  const p = refPath(name);
  if (!existsSync(p)) {
    throw new Error(
      `Lipsește fixtures/reference/${name}. Copiați CSV-ul Elast de referință.`
    );
  }
  return readFileSync(p, "utf-8");
}

function factorFromHeader(text: string, label: RegExp): number {
  const line = text.split(/\r?\n/).find((l) => label.test(l));
  if (!line) throw new Error(`Linie lipsă pentru ${label}`);
  const n = Number(line.split(",")[1]?.trim().replace(",", "."));
  if (!Number.isFinite(n)) throw new Error(`Valoare neconvertibilă: ${line}`);
  return n;
}

function buildCalcPayload(csvText: string, fileName: string) {
  const parsed = parseElastLoggerCsv(csvText, fileName);
  let payload = emptyPayload();
  payload.rawPoints = parsed.rawPoints.map((p) => ({ ...p }));
  payload.workingPoints = rawToWorking(parsed.rawPoints);
  payload.elastMeta = parsed.metadata;
  payload.testFactors = parsed.metadata.factors;
  payload.importSummary = parsed.summary;
  payload.calibration.correctionsAlreadyApplied = true;
  payload.requiredInputs = {
    ...payload.requiredInputs!,
    poisson: 0.33,
    cellLengthM: 0.6,
    cellLengthConfirmed: true,
    apparatusLimitKPa: 20000,
    nominalMaxPressureKPa: 20000,
    practicalLimitConfirmed: true,
    tubeConfigConfirmed: true,
    acceptAutoPs: true,
    fitStartIdx: 5,
    fitEndIdx: 20,
    psManualKPa: null,
    operatorName: "test",
    notes: null,
  };
  payload.programmeState = {
    ...payload.programmeState!,
    programme: "A",
    programmeConfirmed: true,
    measurementBasis: "radial_displacement",
  };
  return recomputePayload(payload).payload;
}

describe("FlexiPMT reference — prezență CSV Elast", () => {
  it("000ELAST.CSV și 001ELAST.CSV sunt în fixtures/reference/", () => {
    const missing = Object.values(ELAST).filter((f) => !existsSync(refPath(f)));
    expect(
      missing,
      missing.length
        ? `CSV Elast LIPSA:\n${missing.map((m) => `  - ${m}`).join("\n")}`
        : "ok"
    ).toEqual([]);
  });
});

describe("FlexiPMT reference — 000ELAST.CSV (Hole 60785)", () => {
  it("metadate, factori, Data size=102, puncte", () => {
    const text = loadElast(ELAST.elast000);
    expect(text).toMatch(/Hole\s*No\.\s*,\s*60785/i);
    expect(text).toMatch(/Depth\[m\]\s*,\s*19\.0/i);
    expect(text).toMatch(/Data\s*size\s*,\s*102/i);
    expect(text).toMatch(/Factor\s*A\(1\)\s*,\s*811\.465/i);
    expect(text).toMatch(/Factor\s*A\(2\)\s*,\s*-0\.582/i);
    expect(text).toMatch(/Factor\s*G\s*,\s*-4\.598/i);
    expect(text).toMatch(/Factor\s*dRi\(A\)\s*,\s*1\.690/i);

    const r = parseElastLoggerCsv(text, ELAST.elast000);
    expect(r.metadata.holeNo).toBe("60785");
    expect(r.metadata.depthM).toBe(19.0);
    expect(r.metadata.dataSize).toBe(102);
    expect(r.devicePoints.length).toBe(102);
    expect(r.rawPoints.length).toBe(102);
    expect(r.metadata.factors.factorA1).toBeCloseTo(811.465, 3);
    expect(r.metadata.factors.factorA2).toBeCloseTo(-0.582, 3);
    expect(r.metadata.factors.factorG).toBeCloseTo(-4.598, 3);
    expect(r.metadata.factors.factorDriA).toBeCloseTo(1.69, 3);
    expect(r.firstReading).not.toBeNull();
    expect(r.lastReading).not.toBeNull();
    expect(r.rawPoints[0].pressureKPa).toBeCloseTo(
      (r.rawPoints[0].pressureMPa ?? 0) * 1000,
      5
    );
  });
});

describe("FlexiPMT reference — 001ELAST.CSV (Hole 60785)", () => {
  it("metadate, Data size=105, factori = antetul fișierului", () => {
    const text = loadElast(ELAST.elast001);
    expect(text).toMatch(/Hole\s*No\.\s*,\s*60785/i);
    expect(text).toMatch(/Depth\[m\]\s*,\s*21\.0/i);
    expect(text).toMatch(/Data\s*size\s*,\s*105/i);

    const headerA1 = factorFromHeader(text, /Factor\s*A\(1\)/i);
    const headerA2 = factorFromHeader(text, /Factor\s*A\(2\)/i);
    const headerG = factorFromHeader(text, /Factor\s*G\b/i);
    const headerDri = factorFromHeader(text, /Factor\s*dRi/i);

    const r = parseElastLoggerCsv(text, ELAST.elast001);
    expect(r.metadata.holeNo).toBe("60785");
    expect(r.metadata.depthM).toBe(21.0);
    expect(r.metadata.dataSize).toBe(105);
    expect(r.devicePoints.length).toBe(105);
    expect(r.rawPoints.length).toBe(105);
    expect(r.metadata.factors.factorA1).toBeCloseTo(headerA1, 6);
    expect(r.metadata.factors.factorA2).toBeCloseTo(headerA2, 6);
    expect(r.metadata.factors.factorG).toBeCloseTo(headerG, 6);
    expect(r.metadata.factors.factorDriA).toBeCloseTo(headerDri, 6);
  });
});

describe("FlexiPMT — calibrare documentară fără efect pe calcul", () => {
  it("rezultatul din același CSV e identic cu sau fără documente KP/GA atașate", () => {
    const text = loadElast(ELAST.elast000);
    const without = buildCalcPayload(text, ELAST.elast000);
    const fpWithout = resultsFingerprint(without);

    // Atașăm orice CSV KP/GA găsit în reference SAU un document sintetic
    let withDocs = without;
    const kpGaFiles = existsSync(REF)
      ? readdirSync(REF).filter((f) => /_(KP|GA)\.CSV$/i.test(f))
      : [];

    if (kpGaFiles.length > 0) {
      for (const name of kpGaFiles) {
        const cal = parseCalibrationCsv(readFileSync(refPath(name), "utf-8"), name);
        withDocs = associateCalibrationDocument(withDocs, cal).payload;
      }
    } else {
      // Document sintetic — testul nu depinde de fișiere KP/GA reale
      const synthetic = parseCalibrationCsv(
        [
          "Elast Logger 3,(Kp correct)",
          "Pipe diameter[mm], 76.00",
          "Factor A(1), 1.000",
          "Factor A(2), 0.000",
          "Factor G, 0.000",
          "Factor dRi(A), 1.000",
          "",
          "Number,Pass time[hh:mm:ss], Pressure[MPa], dRi[mm], R[mm]",
          "0, 00:00:00, 1.0, 0.0, 38.000",
        ].join("\n"),
        "synthetic_KP.CSV"
      );
      withDocs = associateCalibrationDocument(withDocs, synthetic).payload;
    }

    const after = recomputePayload(withDocs).payload;
    const fpWith = resultsFingerprint(after);

    expect(after.associatedCalibrations!.length).toBeGreaterThan(0);
    expect(fpWith).toBe(fpWithout);
    // Puncte aparat neschimbate
    expect(after.rawPoints[0].pressureMPa).toBe(without.rawPoints[0].pressureMPa);
    expect(after.rawPoints[0].radiusMm).toBe(without.rawPoints[0].radiusMm);
    expect(after.rawPoints[0].dRiMm).toBe(without.rawPoints[0].dRiMm);
    expect(after.calibration.kp).toBe(without.calibration.kp);
    expect(after.calibration.ga).toBe(without.calibration.ga);
    expect(after.calibration.radiusMm).toBe(without.calibration.radiusMm);
  });
});
