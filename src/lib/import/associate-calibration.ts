/**
 * Asociere documentară a unui fișier KP/GA la test.
 *
 * Elast Logger a aplicat deja calibrarea aparatului la exportul Pressure/dRi/R.
 * FlexiPMT NU folosește aceste fișiere la calcul: nu corectează, nu recalculează,
 * nu înlocuiește valori din CSV-ul testului și nu reaplica Factor A(1)/A(2)/G/dRi(A).
 */

import type { ParsedCalibrationFile } from "@/lib/import/calibration-csv";
import { compareFactors } from "@/lib/import/calibration-csv";
import type { AssociatedCalibration, PmtPayloadV1 } from "@/lib/schema/pmt-v1";
import type { ElastDeviceFactors } from "@/lib/import/elast-csv";

export function associateCalibrationDocument(
  payload: PmtPayloadV1,
  file: ParsedCalibrationFile
): {
  payload: PmtPayloadV1;
  association: AssociatedCalibration;
  warnings: string[];
} {
  const testFactors: ElastDeviceFactors =
    payload.testFactors ??
    payload.elastMeta?.factors ?? {
      factorA1: null,
      factorA2: null,
      factorG: null,
      factorDriA: null,
    };

  const factorDiffWarnings = compareFactors(testFactors, file.factors);
  const association: AssociatedCalibration = {
    associatedAt: new Date().toISOString(),
    file,
    factorDiffWarnings,
  };

  const warnings = [
    ...file.warnings,
    ...factorDiffWarnings,
    "Fișierul KP/GA este doar document de referință pentru aparat — fără efect asupra calculului.",
    "Pressure, dRi și R din CSV-ul testului rămân neschimbate; factorii A(1)/A(2)/G/dRi(A) nu se reaplică.",
  ];

  // Copie — doar lista de documente și o notă; kp/ga/radius/poisson/puncte neschimbate
  const next: PmtPayloadV1 = {
    ...payload,
    interpretation: { ...payload.interpretation },
    results: [...payload.results],
    rawPoints: payload.rawPoints.map((p) => ({ ...p })),
    workingPoints: payload.workingPoints.map((p) => ({ ...p })),
    associatedCalibrations: [
      ...(payload.associatedCalibrations ?? []),
      association,
    ],
    calibration: {
      ...payload.calibration,
      // kp, ga, radiusMm, poisson — neschimbate
      notes: [
        payload.calibration.notes,
        `Document calibrare ${file.kind} asociat: ${file.fileName} (fără efect pe calcul).`,
      ]
        .filter(Boolean)
        .join(" "),
      correctionsAlreadyApplied: true,
    },
  };

  return { payload: next, association, warnings };
}

/** Amprentă rezultate pentru teste de invarianță (ignoră documentele asociate). */
export function resultsFingerprint(payload: PmtPayloadV1): string {
  const pts = payload.workingPoints
    .filter((p) => p.status !== "excluded")
    .map(
      (p) =>
        `${p.index}:${p.pressureMPa}:${p.pressureKPa}:${p.dRiMm}:${p.radiusMm}:${p.volumeCm3}:${p.status}`
    );
  const res = payload.results.map(
    (r) => `${r.key}:${r.value}:${r.unit}:${r.origin}`
  );
  return JSON.stringify({
    pts,
    res,
    pMax: payload.interpretation.pMaxKPa,
    ps: payload.interpretation.psKPa,
    kp: payload.calibration.kp,
    ga: payload.calibration.ga,
    radiusMm: payload.calibration.radiusMm,
    poisson: payload.calibration.poisson,
  });
}
