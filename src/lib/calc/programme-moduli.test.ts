import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { parseElastLoggerCsv } from "@/lib/import/elast-csv";
import { emptyPayload, rawToWorking, activePoints } from "@/lib/schema/pmt-v1";
import { recomputePayload } from "@/lib/payload";
import { segmentPressureCurve } from "@/lib/calc/segment-curve";
import {
  computeGpbpOnSegment,
  computeKf,
  gpbpFromRadialSlope,
} from "@/lib/calc/iso-formulae";
import {
  availableResultKeys,
  checkProgrammeABand,
  clearManualSelections,
  resetToAutomaticSegmentation,
  runProgrammeCalculations,
  selectionToOverride,
} from "@/lib/calc/programme-moduli";
import { defaultProgrammeState } from "@/lib/calc/programme-types";
import { associateCalibrationDocument } from "@/lib/import/associate-calibration";
import { parseCalibrationCsv } from "@/lib/import/calibration-csv";
import { resultsFingerprint } from "@/lib/import/associate-calibration";

const REF = path.join(process.cwd(), "fixtures", "reference");

function loadElast(name: string) {
  return parseElastLoggerCsv(
    readFileSync(path.join(REF, name), "utf-8"),
    name
  );
}

function payloadFromElast(name: string) {
  const parsed = loadElast(name);
  let payload = emptyPayload();
  payload.rawPoints = parsed.rawPoints.map((p) => ({ ...p }));
  payload.workingPoints = rawToWorking(parsed.rawPoints);
  payload.elastMeta = parsed.metadata;
  payload.testFactors = parsed.metadata.factors;
  payload.originalCsvText = parsed.originalText;
  payload.calibration.correctionsAlreadyApplied = true;
  payload.correctionsStatus = "unverified";
  payload.requiredInputs = {
    ...payload.requiredInputs!,
    poisson: 0.33,
    cellLengthM: 0.6,
    cellLengthConfirmed: true,
    apparatusLimitKPa: 20000,
    nominalMaxPressureKPa: 20000,
    practicalLimitConfirmed: true,
    tubeSize: "NX",
    packerHardness: "Hard",
    packerDiameterMm: 70,
    probeModel: "digital_sonde_4301",
    tubeConfigConfirmed: true,
    acceptAutoPs: true,
    fitStartIdx: 5,
    fitEndIdx: 20,
    psManualKPa: null,
    psCsvPointNumber: null,
    operatorName: "test",
    notes: null,
  };
  return payload;
}

describe("ISO formule", () => {
  it("Formula (5): GPBP = (rs/2)×slope", () => {
    expect(gpbpFromRadialSlope(0.1, 40)).toBeCloseTo(2, 6);
  });

  it("Formula (5) pe segment cu δ", () => {
    const out = computeGpbpOnSegment({
      pressureMPa: [1, 2, 3],
      radialMm: [0, 1, 2],
      rsMm: 40,
      vsCm3: 100,
      basis: "radial_displacement",
    });
    expect(out.gpbp).toBeCloseTo(20, 5);
    expect(out.formula).toMatch(/Formula \(5\)/);
  });

  it("Formula (7) kf", () => {
    const out = computeKf({
      delta1Mm: 1,
      delta2Mm: 2,
      t1Min: 1,
      t2Min: 10,
    });
    expect(out.kf).toBeCloseTo(1 / Math.log10(10), 6);
  });
});

describe("Selecție manuală — fără preselecție / fără atribuire automată", () => {
  it("la deschidere (doar CSV): niciun interval, niciun modul de program", () => {
    let payload = payloadFromElast("000ELAST.CSV");
    expect(payload.programmeState!.fitOverrides).toEqual([]);
    expect(payload.programmeState!.selectionTargetKey).toBeNull();
    payload = recomputePayload(payload).payload;
    const progKeys = payload.results.filter((r) =>
      /^(GL1|GU\d+|GR\d+|GUR\d+|kf|G_cycle)/.test(r.key)
    );
    expect(progKeys).toHaveLength(0);
    expect(payload.programmeState!.fitOverrides).toEqual([]);
  });

  it("program A confirmat fără fitOverrides → zero rezultate modul", () => {
    let payload = payloadFromElast("000ELAST.CSV");
    payload.programmeState = {
      ...defaultProgrammeState(),
      programme: "A",
      programmeConfirmed: true,
      measurementBasis: "radial_displacement",
    };
    const out = recomputePayload(payload);
    payload = out.payload;
    expect(payload.results.some((r) => r.key === "GL1")).toBe(false);
    expect(payload.results.some((r) => /^GU\d+$/.test(r.key))).toBe(false);
    expect(payload.results.some((r) => /^GR\d+$/.test(r.key))).toBe(false);
    expect(out.warnings.some((w) => /Nicio selecție manuală/i.test(w))).toBe(
      true
    );
    expect(payload.programmeState!.loopCompliance.requiredMin).toBe(2);
  });

  it("program A: GL1 apare doar după selecție manuală", () => {
    let payload = payloadFromElast("000ELAST.CSV");
    const indices = [5, 6, 7, 8, 9, 10];
    payload.programmeState = {
      ...defaultProgrammeState(),
      programme: "A",
      programmeConfirmed: true,
      measurementBasis: "radial_displacement",
      selectionTargetKey: "GL1",
      fitOverrides: [
        selectionToOverride({
          resultKey: "GL1",
          activeIndices: indices,
          author: "tester",
        }),
      ],
    };
    payload = recomputePayload(payload).payload;
    const gl1 = payload.results.find((r) => r.key === "GL1");
    expect(gl1).toBeTruthy();
    expect(gl1!.value).not.toBeNull();
    expect(gl1!.usedActiveIndices).toEqual(indices);
    expect(gl1!.dataInterval).toMatch(/n=6/);
    expect(gl1!.formula).toMatch(/Formula \(5\)|Formula \(6\)/);
    expect(payload.results.some((r) => /^GU\d+$/.test(r.key))).toBe(false);
  });

  it("program A: GU1 cu bandă 30–70% — abatere cere motiv", () => {
    let payload = payloadFromElast("000ELAST.CSV");
    const active = activePoints(payload.workingPoints);
    // Capetele curbei — tipic în afara 30–70% local
    const indices = [0, 1, 2, 3];
    const band = checkProgrammeABand(
      "GU1",
      active,
      indices,
      indices.map((i) => active[i])
    );
    payload.programmeState = {
      ...defaultProgrammeState(),
      programme: "A",
      programmeConfirmed: true,
      measurementBasis: "radial_displacement",
      fitOverrides: [
        selectionToOverride({
          resultKey: "GU1",
          activeIndices: indices,
          outsideStandardBand: band.outside,
          reason: band.outside ? "motiv test" : null,
          author: "tester",
        }),
      ],
    };
    const out = recomputePayload(payload);
    const gu1 = out.payload.results.find((r) => r.key === "GU1");
    expect(gu1).toBeTruthy();
    if (band.outside) {
      expect(gu1!.note).toMatch(/ABATERE|30–70%/i);
    }
  });

  it("program B: GUR1 doar din selecție; subset marcat ca abatere", () => {
    let payload = payloadFromElast("000ELAST.CSV");
    payload.programmeState = {
      ...defaultProgrammeState(),
      programme: "B",
      programmeConfirmed: true,
      measurementBasis: "radial_displacement",
      fitOverrides: [
        selectionToOverride({
          resultKey: "GUR1",
          activeIndices: [10, 11, 12, 13],
          loopPointsExcluded: true,
          reason: "analiză pe subset",
          author: "tester",
        }),
      ],
    };
    payload = recomputePayload(payload).payload;
    const gur = payload.results.find((r) => r.key === "GUR1");
    expect(gur).toBeTruthy();
    expect(gur!.note).toMatch(/subset|ABATERE/i);
    expect(payload.results.some((r) => /^GU\d+$/.test(r.key))).toBe(false);
    expect(payload.programmeState!.loopCompliance.requiredMin).toBe(3);
  });

  it("program C presiune: kf doar din punctele selectate", () => {
    let payload = payloadFromElast("000ELAST.CSV");
    const active = activePoints(payload.workingPoints);
    // Caută un interval scurt cu presiune relativ stabilă
    let best: number[] = [0, 1];
    let bestSpan = Infinity;
    for (let i = 0; i < active.length - 4; i++) {
      const slice = active.slice(i, i + 5);
      const span =
        Math.max(...slice.map((p) => p.pressureKPa)) -
        Math.min(...slice.map((p) => p.pressureKPa));
      if (span < bestSpan) {
        bestSpan = span;
        best = [i, i + 1, i + 2, i + 3, i + 4];
      }
    }
    payload.programmeState = {
      ...defaultProgrammeState(),
      programme: "C",
      programmeConfirmed: true,
      controllingParameter: "pressure",
      measurementBasis: "radial_displacement",
      fitOverrides: [
        selectionToOverride({
          resultKey: "kf",
          activeIndices: best,
          author: "tester",
        }),
      ],
    };
    const out = recomputePayload(payload);
    const kf = out.payload.results.find((r) => r.key === "kf");
    expect(kf).toBeTruthy();
    expect(kf!.formula).toMatch(/Formula \(7\)/);
    expect(kf!.unit).toBe("mm");
    expect(kf!.usedActiveIndices).toEqual(best);
  });

  it("program C control δ: nu calculează kf Formula 7", () => {
    let payload = payloadFromElast("001ELAST.CSV");
    payload.programmeState = {
      ...defaultProgrammeState(),
      programme: "C",
      programmeConfirmed: true,
      controllingParameter: "radial_displacement",
      measurementBasis: "radial_displacement",
      fitOverrides: [
        selectionToOverride({
          resultKey: "kf",
          activeIndices: [2, 3, 4, 5],
          author: "tester",
        }),
      ],
    };
    const out = recomputePayload(payload);
    expect(out.payload.results.some((r) => r.key === "kf")).toBe(false);
    expect(
      out.warnings.some((w) => /presiune|Formula 7|controlat/i.test(w))
    ).toBe(true);
  });

  it("program D: calcule pe ciclu marcate exploratorii", () => {
    let payload = payloadFromElast("000ELAST.CSV");
    payload.programmeState = {
      ...defaultProgrammeState(),
      programme: "D",
      programmeConfirmed: true,
      measurementBasis: "radial_displacement",
      fitOverrides: [
        selectionToOverride({
          resultKey: "G_cycle1_exploratory",
          activeIndices: [4, 5, 6, 7, 8],
          author: "tester",
        }),
      ],
    };
    payload = recomputePayload(payload).payload;
    const r = payload.results.find((x) => x.key === "G_cycle1_exploratory");
    expect(r).toBeTruthy();
    expect(r!.reference).toMatch(/NU rezultat specific program D|exploratoriu/i);
    expect(r!.note).toMatch(/exploratoriu/i);
  });

  it("clearManualSelections / reset șterg override-urile", () => {
    const st = {
      ...defaultProgrammeState(),
      programme: "A" as const,
      fitOverrides: [
        selectionToOverride({
          resultKey: "GL1",
          activeIndices: [1, 2, 3],
          author: "x",
        }),
      ],
      selectionTargetKey: "GL1",
      manualSegmentation: true,
    };
    const cleared = clearManualSelections(st);
    expect(cleared.fitOverrides).toEqual([]);
    expect(cleared.selectionTargetKey).toBeNull();
    const reset = resetToAutomaticSegmentation(st);
    expect(reset.fitOverrides).toEqual([]);
  });

  it("availableResultKeys respectă programul", () => {
    expect(availableResultKeys("A")).toContain("GL1");
    expect(availableResultKeys("A")).toContain("GU1");
    expect(availableResultKeys("A")).toContain("GU6");
    expect(availableResultKeys("B")).toContain("GUR1");
    expect(availableResultKeys("B")).toContain("GU_final");
    expect(availableResultKeys("B")).toContain("GU1_exploratory");
    expect(availableResultKeys("B")).not.toContain("GU1");
    expect(availableResultKeys("C")).toEqual(["kf"]);
    expect(availableResultKeys("D")[0]).toMatch(/exploratory/);
  });

  it("selecția persistă pe Number CSV și se rezolvă după redeschidere", () => {
    let payload = payloadFromElast("000ELAST.CSV");
    const active = activePoints(payload.workingPoints);
    const indices = [5, 6, 7, 8];
    const ov = selectionToOverride({
      resultKey: "GL1",
      activeIndices: indices,
      activePoints: active,
      author: "t",
    });
    expect(ov.csvPointNumbers).toEqual(indices.map((i) => active[i].index));
    payload.programmeState = {
      ...defaultProgrammeState(),
      programme: "A",
      programmeConfirmed: true,
      fitOverrides: [ov],
    };
    payload = recomputePayload(payload).payload;
    const gl1 = payload.results.find((r) => r.key === "GL1");
    expect(gl1?.dataInterval).toMatch(/CSV Number=/);
    expect(gl1?.usedActiveIndices).toEqual(indices);

    // Simulare: doar csvPointNumbers (fără activeIndices) — ca după migrare
    payload.programmeState = {
      ...payload.programmeState!,
      fitOverrides: [
        {
          ...ov,
          activeIndices: undefined,
          csvPointNumbers: ov.csvPointNumbers,
        },
      ],
    };
    payload = recomputePayload(payload).payload;
    expect(payload.results.find((r) => r.key === "GL1")?.value).toBe(gl1?.value);
  });

  it("Program B: GU_final e rezultat separat, nu GUR", () => {
    let payload = payloadFromElast("000ELAST.CSV");
    const active = activePoints(payload.workingPoints);
    payload.programmeState = {
      ...defaultProgrammeState(),
      programme: "B",
      programmeConfirmed: true,
      fitOverrides: [
        selectionToOverride({
          resultKey: "GU_final",
          activeIndices: [active.length - 8, active.length - 7, active.length - 6, active.length - 5],
          activePoints: active,
          author: "t",
        }),
      ],
    };
    payload = recomputePayload(payload).payload;
    const r = payload.results.find((x) => x.key === "GU_final");
    expect(r).toBeTruthy();
    expect(r!.reference).toMatch(/6\.4\.1|NU GURi/i);
    expect(payload.results.some((x) => /^GUR\d+$/.test(x.key))).toBe(false);
  });

  it("CSV original nemodificat după calcul pe program", () => {
    const text = readFileSync(path.join(REF, "000ELAST.CSV"), "utf-8");
    let payload = payloadFromElast("000ELAST.CSV");
    const raw0 = JSON.stringify(payload.rawPoints);
    payload.programmeState = {
      ...defaultProgrammeState(),
      programme: "A",
      programmeConfirmed: true,
      fitOverrides: [
        selectionToOverride({
          resultKey: "GL1",
          activeIndices: [5, 6, 7, 8],
          author: "t",
        }),
      ],
    };
    payload = recomputePayload(payload).payload;
    expect(JSON.stringify(payload.rawPoints)).toBe(raw0);
    expect(payload.originalCsvText).toBe(text);
  });

  it("KP/GA atașat nu schimbă fingerprint rezultate", () => {
    let payload = payloadFromElast("000ELAST.CSV");
    payload.programmeState = {
      ...defaultProgrammeState(),
      programme: "A",
      programmeConfirmed: true,
      fitOverrides: [
        selectionToOverride({
          resultKey: "GL1",
          activeIndices: [5, 6, 7, 8],
          author: "t",
        }),
      ],
    };
    payload = recomputePayload(payload).payload;
    const fp0 = resultsFingerprint(payload);
    const cal = parseCalibrationCsv(
      [
        "Elast Logger 3,(Kp correct)",
        "Pipe diameter[mm], 76.00",
        "Factor A(1), 1",
        "Factor A(2), 0",
        "Factor G, 0",
        "Factor dRi(A), 1",
        "",
        "Number,Pass time[hh:mm:ss], Pressure[MPa], dRi[mm], R[mm]",
        "0, 00:00:00, 1.0, 0.0, 38.000",
      ].join("\n"),
      "doc_KP.CSV"
    );
    const associated = associateCalibrationDocument(payload, cal).payload;
    const after = recomputePayload(associated).payload;
    expect(resultsFingerprint(after)).toBe(fp0);
  });
});

describe("Segmentare informativă (nu alimentează calculele)", () => {
  it("000ELAST: detectează faze și bucle variabile", () => {
    const parsed = loadElast("000ELAST.CSV");
    const active = rawToWorking(parsed.rawPoints);
    const seg = segmentPressureCurve(active);
    expect(seg.phases.length).toBeGreaterThan(2);
    expect(seg.loops.length).toBeGreaterThanOrEqual(1);
  });

  it("runProgrammeCalculations fără override → 0 rezultate chiar cu faze", () => {
    const active = rawToWorking(loadElast("001ELAST.CSV").rawPoints);
    const seg = segmentPressureCurve(active);
    const out = runProgrammeCalculations({
      active,
      psKPa: 500,
      cellLengthM: 0.6,
      state: {
        ...defaultProgrammeState(),
        programme: "A",
        programmeConfirmed: true,
        phases: seg.phases,
        loops: seg.loops,
        measurementBasis: "radial_displacement",
      },
      rsMmFallback: 37,
    });
    expect(out.results).toHaveLength(0);
  });
});
