/**
 * Parser calibrare Elast Logger (Kp correct / Gain correct).
 *
 * Conform OYO-App data_manager.load_calibration:
 * - KP: țintă rază = pipe_diameter/2 (ex. 76 mm → 38 mm)
 * - GA: țintă rază = pipe_diameter/2 (ex. 85 mm → 42.5 mm)
 * - Derivă un factor Kp/Ga = 1 + (target - avgR)/avgR din razele măsurate.
 *
 * IMPORTANT FlexiPMT:
 * - KP/GA = documente de referință pentru aparat; fără efect pe calcul.
 * - Nu aplicăm derivedScaleFactor și nu reaplica Factor A(1)/A(2)/G/dRi(A) pe Pressure/dRi/R.
 * - Comparația factorilor cu CSV-ul testului e doar informativă.
 */

import type { ElastDeviceFactors } from "@/lib/import/elast-csv";

export type CalibrationKind = "KP" | "GA" | "UNKNOWN";

export type ParsedCalibrationFile = {
  fileName: string;
  kind: CalibrationKind;
  headerLabel: string | null;
  pipeDiameterMm: number | null;
  tubeType: string | null;
  fileId: string | null;
  date: string | null;
  time: string | null;
  dataSize: number | null;
  factors: ElastDeviceFactors;
  measuredRadiiMm: number[];
  avgMeasuredRadiusMm: number | null;
  targetRadiusMm: number | null;
  /** Factor derivat ca în OYO (doar informativ, neaplicat pe datele testului) */
  derivedScaleFactor: number | null;
  pointsRead: number;
  warnings: string[];
  notes: string[];
};

function parseNum(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function splitCsvLine(line: string): string[] {
  return line.split(",").map((p) => p.trim());
}

export function parseCalibrationCsv(
  text: string,
  fileName: string
): ParsedCalibrationFile {
  const lines = text.split(/\r\n|\n|\r/);
  const warnings: string[] = [];
  const notes: string[] = [
    "Document de referință pentru aparatul OYO — fără efect asupra calculului FlexiPMT.",
    "Elast Logger a folosit calibrarea aparatului la exportul Pressure/dRi/R; FlexiPMT nu le reaplică.",
    "derivedScaleFactor (dacă e calculat) e doar informativ, nu intră în rezultate.",
  ];

  let kind: CalibrationKind = "UNKNOWN";
  let headerLabel: string | null = null;
  let pipeDiameterMm: number | null = null;
  let tubeType: string | null = null;
  let fileId: string | null = null;
  let date: string | null = null;
  let time: string | null = null;
  let dataSize: number | null = null;
  const factors: ElastDeviceFactors = {
    factorA1: null,
    factorA2: null,
    factorG: null,
    factorDriA: null,
  };

  let headerIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (/Kp\s*correct/i.test(trimmed)) {
      kind = "KP";
      headerLabel = trimmed;
    } else if (/Gain\s*correct/i.test(trimmed)) {
      kind = "GA";
      headerLabel = trimmed;
    }

    const parts = splitCsvLine(line);
    const key = (parts[0] ?? "").trim().toLowerCase();
    const val = (parts[1] ?? "").trim();

    if (/pipe\s*diameter/i.test(parts[0] ?? "")) pipeDiameterMm = parseNum(val);
    else if (key === "file id") fileId = val || null;
    else if (key === "date") date = val || null;
    else if (key === "time") time = val || null;
    else if (key === "tube type") tubeType = val || null;
    else if (key === "data size") dataSize = parseNum(val);
    else if (/^factor\s*a\s*\(?\s*1\s*\)?/i.test(parts[0] ?? ""))
      factors.factorA1 = parseNum(val);
    else if (/^factor\s*a\s*\(?\s*2\s*\)?/i.test(parts[0] ?? ""))
      factors.factorA2 = parseNum(val);
    else if (/^factor\s*g\b/i.test(parts[0] ?? "")) factors.factorG = parseNum(val);
    else if (/^factor\s*dri/i.test(parts[0] ?? ""))
      factors.factorDriA = parseNum(val);

    if (/Number/i.test(trimmed) && /Pass\s*time/i.test(trimmed)) {
      headerIdx = i;
      break;
    }
  }

  if (kind === "UNKNOWN") {
    warnings.push(
      "Tipul calibrării (Kp correct / Gain correct) nu a fost detectat în antet — verificare necesară."
    );
  }

  const measuredRadiiMm: number[] = [];
  if (headerIdx >= 0) {
    const header = splitCsvLine(lines[headerIdx]);
    const iR = header.findIndex((h) => /^R\s*\[?\s*mm\s*\]?$/i.test(h.trim()));
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = splitCsvLine(lines[i]);
      const r = parseNum(parts[iR >= 0 ? iR : 4] ?? "");
      if (r != null) measuredRadiiMm.push(r);
    }
  } else {
    warnings.push("Antetul tabelului Number/Pass time nu a fost găsit.");
  }

  const avgMeasuredRadiusMm =
    measuredRadiiMm.length > 0
      ? measuredRadiiMm.reduce((a, b) => a + b, 0) / measuredRadiiMm.length
      : null;

  let targetRadiusMm: number | null = null;
  if (pipeDiameterMm != null) targetRadiusMm = pipeDiameterMm / 2;
  else if (kind === "KP") targetRadiusMm = 38;
  else if (kind === "GA") targetRadiusMm = 42.5;

  let derivedScaleFactor: number | null = null;
  if (avgMeasuredRadiusMm != null && targetRadiusMm != null && avgMeasuredRadiusMm !== 0) {
    derivedScaleFactor = 1 + (targetRadiusMm - avgMeasuredRadiusMm) / avgMeasuredRadiusMm;
  }

  if (dataSize != null && dataSize !== measuredRadiiMm.length) {
    warnings.push(
      `Data size calibrare (${dataSize}) ≠ puncte citite (${measuredRadiiMm.length}).`
    );
  }

  return {
    fileName,
    kind,
    headerLabel,
    pipeDiameterMm,
    tubeType,
    fileId,
    date,
    time,
    dataSize,
    factors,
    measuredRadiiMm,
    avgMeasuredRadiusMm,
    targetRadiusMm,
    derivedScaleFactor,
    pointsRead: measuredRadiiMm.length,
    warnings,
    notes,
  };
}

export function compareFactors(
  test: ElastDeviceFactors,
  cal: ElastDeviceFactors,
  tol = 1e-6
): string[] {
  const diffs: string[] = [];
  const pairs: [keyof ElastDeviceFactors, string][] = [
    ["factorA1", "Factor A(1)"],
    ["factorA2", "Factor A(2)"],
    ["factorG", "Factor G"],
    ["factorDriA", "Factor dRi(A)"],
  ];
  for (const [k, label] of pairs) {
    const a = test[k];
    const b = cal[k];
    if (a == null || b == null) continue;
    if (Math.abs(a - b) > tol) {
      diffs.push(
        `${label}: test=${a} ≠ calibrare=${b} — verificare necesară; factorii testului NU sunt înlocuiți.`
      );
    }
  }
  return diffs;
}
