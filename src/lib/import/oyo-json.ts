/**
 * Import din JSON migrat din .oyo (produs de tools/oyo_migrate.py).
 * Nu citește pickle în browser.
 */

import type {
  Calibration,
  ImportSummary,
  Interpretation,
  PmtPayloadV1,
  RawPoint,
} from "@/lib/schema/pmt-v1";
import {
  defaultCalibration,
  defaultInterpretation,
  emptyPayload,
  rawToWorking,
} from "@/lib/schema/pmt-v1";

export type OyoJsonDocument = {
  schemaVersion?: number;
  source?: { fileName?: string; format?: string };
  rawPoints?: Array<Partial<RawPoint> & { pressureKPa?: number; volumeCm3?: number }>;
  calibration?: Partial<Calibration> & { radius?: number };
  additionalParams?: Record<string, unknown>;
  graphParams?: Record<string, unknown>;
  resultsLegacy?: Record<string, unknown>;
  resultsIsoLegacy?: Record<string, unknown>;
  testMetadata?: Record<string, unknown>;
  companyInfo?: Record<string, unknown>;
  reportConfig?: Record<string, unknown>;
  correctionsAlreadyApplied?: boolean;
  warnings?: string[];
};

export type OyoImportResult = {
  payload: PmtPayloadV1;
  meta: {
    holeNo?: string;
    depthM?: number;
    testDate?: string;
    testLabel?: string;
    location?: string;
    projectHints: Record<string, string | undefined>;
  };
  summary: ImportSummary;
};

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function importOyoJson(
  doc: OyoJsonDocument,
  sourceFileName: string
): OyoImportResult {
  const warnings = [...(doc.warnings ?? [])];
  const missingFields: string[] = [];
  const unconvertedFields: string[] = [];

  if (!doc.rawPoints || !Array.isArray(doc.rawPoints) || doc.rawPoints.length === 0) {
    throw new Error(
      "JSON-ul migrat nu conține rawPoints. Rulați tools/oyo_migrate.py pe fișierul .oyo de încredere."
    );
  }

  const rawPoints: RawPoint[] = [];
  for (const p of doc.rawPoints) {
    let pressureKPa = num(p.pressureKPa);
    const pressureMPa = num(p.pressureMPa);
    if (pressureKPa == null && pressureMPa != null) pressureKPa = pressureMPa * 1000;
    const volumeCm3 = num(p.volumeCm3);
    if (pressureKPa == null || volumeCm3 == null) {
      warnings.push(`Punct index=${p.index}: presiune sau volum lipsă — omis.`);
      continue;
    }
    rawPoints.push({
      index: num(p.index) ?? rawPoints.length,
      time: (p.time as string) ?? null,
      pressureMPa: pressureMPa ?? pressureKPa / 1000,
      pressureKPa,
      dRiMm: num(p.dRiMm),
      radiusMm: num(p.radiusMm),
      volumeCm3,
    });
  }

  if (rawPoints.length === 0) {
    throw new Error("Niciun punct valid după conversie.");
  }

  const calSrc = doc.calibration ?? {};
  const correctionsAlreadyApplied =
    doc.correctionsAlreadyApplied === true ||
    // OYO vechi: datele din .oyo sunt deja prelucrate (pressure/volume derivate)
    true;

  const calibration: Calibration = {
    ...defaultCalibration(),
    kp: num(calSrc.kp) ?? 1,
    ga: num(calSrc.ga) ?? 1,
    radiusMm: num(calSrc.radiusMm) ?? num(calSrc.radius) ?? 35,
    poisson: num(calSrc.poisson) ?? 0.33,
    correctionsAlreadyApplied,
    notes:
      "Import .oyo: nu se reaplică Kp/Ga. În OYO vechi, calea de calcul nota Kp/Ga scoase din calcule.",
  };

  const gp = doc.graphParams ?? {};
  const interpretation: Interpretation = {
    ...defaultInterpretation(),
    fitStartIdx: num(gp.fit_start_idx),
    fitEndIdx: num(gp.fit_end_idx) != null ? num(gp.fit_end_idx)! - 1 : null,
    programme: gp.programme_a
      ? "A"
      : gp.programme_b
        ? "B"
        : gp.programme_c
          ? "C"
          : "none",
    psKPa: num(gp.ps_manual_kpa),
    psOrigin: num(gp.ps_manual_kpa) != null ? "manual" : "unavailable",
    // pl_manual din OYO: tratat ca candidat, NU ca rupere automată
    rupturePressureKPa: null,
    ruptureOrigin: "unavailable",
    pMaxKPa: null,
    pMaxOrigin: "unavailable",
    apparatusLimitKPa: null,
    apparatusLimitReachedWithoutRupture: false,
  };

  const legacyPl = num(doc.resultsLegacy?.pL) ?? num(doc.resultsIsoLegacy?.pL);
  if (legacyPl != null) {
    warnings.push(
      `OYO vechi avea pL=${legacyPl} (= max presiune). În FlexiPMT aceasta este pMax, nu rupere automată.`
    );
    unconvertedFields.push("resultsLegacy.pL→pMax (nu rupture)");
  }
  if (num(gp.pl_manual_kpa) != null) {
    warnings.push(
      `pl_manual_kpa=${gp.pl_manual_kpa} din .oyo nu a fost mapat automat la rupere — introduceți explicit dacă este rupere observată.`
    );
    unconvertedFields.push("graphParams.pl_manual_kpa");
  }

  // Câmpuri ambigue din additional_params (height/density nu sunt în ISO 6.3)
  const add = doc.additionalParams ?? {};
  for (const k of Object.keys(add)) {
    if (["height", "density"].includes(k)) {
      unconvertedFields.push(`additionalParams.${k}`);
      warnings.push(
        `Parametrul ${k}=${String(add[k])} nu e aplicat automat (nu face parte din ISO 22476-5 moduli).`
      );
    }
  }

  const meta = doc.testMetadata ?? {};
  const company = doc.companyInfo ?? {};

  const summary: ImportSummary = {
    sourceFileName: doc.source?.fileName || sourceFileName,
    sourceFormat: "oyo-json",
    importedAt: new Date().toISOString(),
    pointsImported: rawPoints.length,
    missingFields,
    unconvertedFields,
    warnings,
    correctionsAlreadyApplied: true,
  };

  const payload: PmtPayloadV1 = {
    ...emptyPayload(),
    rawPoints,
    workingPoints: rawToWorking(rawPoints),
    calibration,
    interpretation,
    importSummary: summary,
  };

  return {
    payload,
    meta: {
      holeNo: String(meta.hole_no ?? company.borehole ?? "").trim() || undefined,
      depthM: num(meta.depth) ?? num(company.test_depth) ?? undefined,
      testDate: String(meta.test_date ?? company.test_date ?? "").trim() || undefined,
      testLabel: String(company.test_number ?? "").trim() || undefined,
      location: String(company.location ?? "").trim() || undefined,
      projectHints: {
        client: company.client ? String(company.client) : undefined,
        location: company.location ? String(company.location) : undefined,
        projectName: company.project_name ? String(company.project_name) : undefined,
      },
    },
    summary,
  };
}
