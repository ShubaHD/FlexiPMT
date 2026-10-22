import { describe, expect, it } from "vitest";
import {
  classifyReportGaps,
  reportPdfBaseName,
  sortResultsForReport,
  summarizeCsvNumbers,
  usedFormulas,
} from "@/lib/report/report-content";
import {
  defaultRequiredInputs,
  emptyPayload,
  missingRequiredFields,
} from "@/lib/schema/pmt-v1";
import { defaultProgrammeState } from "@/lib/calc/programme-types";

describe("report-content", () => {
  it("reportPdfBaseName: foraj_adâncime_PMT", () => {
    expect(reportPdfBaseName("BH01", 21)).toBe("BH01_21.00m_PMT");
    expect(reportPdfBaseName("Hole 60785", 19.5)).toBe("Hole_60785_19.50m_PMT");
    expect(reportPdfBaseName("A/B", null)).toBe("A_B_na_PMT");
  });

  it("sortResultsForReport: GL1 înaintea GUR1–3", () => {
    const keys = sortResultsForReport([
      { key: "GUR1" },
      { key: "GUR3" },
      { key: "GL1" },
      { key: "GUR2" },
      { key: "GU_final" },
      { key: "EPBP_GL1" },
      { key: "Kr_GUR1" },
    ]).map((r) => r.key);
    expect(keys).toEqual([
      "GL1",
      "GUR1",
      "GUR2",
      "GUR3",
      "GU_final",
      "EPBP_GL1",
      "Kr_GUR1",
    ]);
  });

  it("summarizeCsvNumbers compactează intervale", () => {
    expect(summarizeCsvNumbers([71, 72, 73, 106, 105, 104])).toBe(
      "n=6, puncte 71–73, 104–106"
    );
    expect(summarizeCsvNumbers([5])).toBe("n=1, puncte 5");
  });

  it("ν / celulă nu blochează Formula (5) fără EPBP volumetric", () => {
    const payload = emptyPayload();
    payload.workingPoints = [
      {
        id: "pt-1",
        index: 1,
        pressureKPa: 100,
        volumeCm3: 0,
        status: "active",
      },
    ];
    payload.programmeState = {
      ...defaultProgrammeState(),
      programme: "A",
      programmeConfirmed: true,
      measurementBasis: "radial_displacement",
      fitOverrides: [
        {
          resultKey: "GL1",
          startIdx: 0,
          endIdx: 1,
          csvPointNumbers: [1, 2],
        },
      ],
    };
    payload.requiredInputs = {
      ...defaultRequiredInputs(),
      psCsvPointNumber: 10,
      psManualKPa: 200,
      poisson: null,
      cellLengthM: null,
      computeEpbp: false,
    };
    payload.results = [
      {
        key: "GL1",
        label: "GL1",
        value: 100,
        unit: "MPa",
        origin: "calculated",
        formula: "GPBP = (rs × Δp) / (2 × Δδ)  [ISO 22476-5:2023 Formula (5)]",
      },
    ];

    const missing = missingRequiredFields(payload);
    expect(missing.some((m) => m.includes("Poisson"))).toBe(false);
    expect(missing.some((m) => m.includes("celulă"))).toBe(false);
    expect(missing.some((m) => m.includes("limită practică"))).toBe(false);

    const optional = classifyReportGaps(payload).filter(
      (g) => g.kind === "optional_result"
    );
    expect(
      optional.some((g) => g.message.includes("Parametri derivați"))
    ).toBe(true);
  });

  it("usedFormulas nu include previzualizări", () => {
    const payload = emptyPayload();
    payload.results = [
      {
        key: "GPBP_preview",
        label: "preview",
        value: 1,
        unit: "MPa",
        origin: "calculated",
        formula: "Formula (6) — previzualizare",
      },
      {
        key: "GL1",
        label: "GL1",
        value: 2,
        unit: "MPa",
        origin: "calculated",
        formula: "GPBP = (rs × Δp) / (2 × Δδ)  [ISO 22476-5:2023 Formula (5)]",
      },
    ];
    expect(usedFormulas(payload)).toEqual([
      "GPBP = (rs × Δp) / (2 × Δδ)  [ISO 22476-5:2023 Formula (5)]",
    ]);
  });
});
