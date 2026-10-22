/**
 * Import fișiere brute tip Elast Logger 3 (CSV / .ORG text).
 * Nu modifică fișierul sursă. Nu reaplica corecții pe Pressure / dRi / R exportate.
 */

import type { ImportSummary, RawPoint } from "@/lib/schema/pmt-v1";
import { CELL_LENGTH_M } from "@/lib/calc/pressuremeter";

export type ElastDeviceFactors = {
  factorA1: number | null;
  factorA2: number | null;
  factorG: number | null;
  factorDriA: number | null;
};

export type ElastMetadata = {
  controlUnit: string | null;
  fileId: string | null;
  testDate: string | null;
  testTime: string | null;
  holeNo: string | null;
  depthM: number | null;
  dataSize: number | null;
  tubeType: string | null;
  factors: ElastDeviceFactors;
};

export type RowIssue = {
  lineNumber: number;
  index: number | null;
  kind:
    | "incomplete"
    | "unconvertible"
    | "missing_number"
    | "duplicate_number"
    | "extra";
  message: string;
  rawLine: string;
};

export type ElastParseResult = {
  rawPoints: RawPoint[];
  /** Copie fidelă a valorilor aparatului (fără volume calculat) */
  devicePoints: Array<{
    index: number;
    time: string | null;
    pressureMPa: number | null;
    dRiMm: number | null;
    radiusMm: number | null;
    incomplete: boolean;
  }>;
  metadata: ElastMetadata;
  rowIssues: RowIssue[];
  firstReading: RawPoint | null;
  lastReading: RawPoint | null;
  summary: ImportSummary;
  /** Text original păstrat pentru trasabilitate (nu se modifică) */
  originalText: string;
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

/** Derivă ΔV din rază (cm³) — CALCUL FlexiPMT, nu export aparat. */
export function volumeFromRadii(
  radiiMm: number[],
  cellLengthM = CELL_LENGTH_M
): number[] {
  if (radiiMm.length === 0) return [];
  const r0 = radiiMm[0] / 1000;
  const v0 = Math.PI * r0 * r0 * cellLengthM * 1e6;
  return radiiMm.map((rMm) => {
    const r = rMm / 1000;
    const v = Math.PI * r * r * cellLengthM * 1e6;
    return v - v0;
  });
}

function emptyFactors(): ElastDeviceFactors {
  return {
    factorA1: null,
    factorA2: null,
    factorG: null,
    factorDriA: null,
  };
}

function parseHeaderMeta(lines: string[]): {
  metadata: ElastMetadata;
  headerIdx: number;
} {
  const metadata: ElastMetadata = {
    controlUnit: null,
    fileId: null,
    testDate: null,
    testTime: null,
    holeNo: null,
    depthM: null,
    dataSize: null,
    tubeType: null,
    factors: emptyFactors(),
  };
  let headerIdx = -1;

  for (let i = 0; i < Math.min(lines.length, 120); i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (/^Elast\s+Logger/i.test(trimmed)) {
      metadata.controlUnit = trimmed.split(",")[0].trim();
    }

    const parts = splitCsvLine(line);
    const key = (parts[0] ?? "").trim().toLowerCase();
    const val = (parts[1] ?? "").trim();

    if (key === "file id") metadata.fileId = val || null;
    else if (key === "date") metadata.testDate = val || null;
    else if (key === "time") metadata.testTime = val || null;
    else if (key.startsWith("hole"))
      metadata.holeNo = val.replace(/,+$/, "") || null;
    else if (key.startsWith("depth")) {
      metadata.depthM = parseNum(val.replace(/,+$/, ""));
    } else if (key === "data size") metadata.dataSize = parseNum(val);
    else if (key === "tube type") metadata.tubeType = val || null;
    else if (/^factor\s*a\s*\(?\s*1\s*\)?/i.test(parts[0] ?? ""))
      metadata.factors.factorA1 = parseNum(val);
    else if (/^factor\s*a\s*\(?\s*2\s*\)?/i.test(parts[0] ?? ""))
      metadata.factors.factorA2 = parseNum(val);
    else if (/^factor\s*g\b/i.test(parts[0] ?? ""))
      metadata.factors.factorG = parseNum(val);
    else if (/^factor\s*dri/i.test(parts[0] ?? ""))
      metadata.factors.factorDriA = parseNum(val);

    // Antet tabel — spații în denumiri tolerate
    if (
      /Number/i.test(trimmed) &&
      /Pass\s*time/i.test(trimmed) &&
      /Pressure/i.test(trimmed)
    ) {
      headerIdx = i;
      break;
    }
  }

  return { metadata, headerIdx };
}

/**
 * Parsează CSV Elast Logger. Valorile Pressure/dRi/R rămân exact ca în fișier.
 * volumeCm3 este calculat ulterior (marcat în summary) — nu e export aparat.
 */
export function parseElastLoggerCsv(
  text: string,
  sourceFileName: string
): ElastParseResult {
  const originalText = text;
  const lines = text.split(/\r\n|\n|\r/);
  const warnings: string[] = [];
  const missingFields: string[] = [];
  const unconvertedFields: string[] = [];
  const rowIssues: RowIssue[] = [];

  const { metadata, headerIdx } = parseHeaderMeta(lines);

  if (headerIdx < 0) {
    throw new Error(
      "Nu s-a găsit antetul datelor (Number, Pass time, Pressure[MPa], …). Verificați că fișierul este export Elast Logger 3."
    );
  }

  const header = splitCsvLine(lines[headerIdx]).map((h) =>
    h.replace(/\s+/g, " ").trim()
  );
  const col = (name: RegExp) => header.findIndex((h) => name.test(h));
  const iNum = col(/^Number$/i);
  const iTime = col(/Pass\s*time/i);
  const iP = col(/Pressure\s*\[?\s*MPa\s*\]?/i);
  const iDri = col(/dRi\s*\[?\s*mm\s*\]?/i);
  const iR = col(/^R\s*\[?\s*mm\s*\]?$/i);

  if (iP < 0) missingFields.push("Pressure[MPa]");
  if (iR < 0) missingFields.push("R[mm]");
  if (iP < 0 || iR < 0) {
    throw new Error(
      `Coloane obligatorii lipsă: ${missingFields.join(", ")}. Antet detectat: ${header.join(" | ")}`
    );
  }

  const seenNumbers = new Map<number, number>();
  const devicePoints: ElastParseResult["devicePoints"] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line) continue;
    const parts = splitCsvLine(rawLine);
    const lineNumber = i + 1;

    const indexRaw = iNum >= 0 ? parts[iNum] ?? "" : "";
    const index = iNum >= 0 ? parseNum(indexRaw) : devicePoints.length;
    const time = iTime >= 0 ? (parts[iTime] ?? "").trim() || null : null;
    const pStr = parts[iP] ?? "";
    const driStr = iDri >= 0 ? parts[iDri] ?? "" : "";
    const rStr = parts[iR] ?? "";

    const pMPa = parseNum(pStr);
    const dRi = iDri >= 0 ? parseNum(driStr) : null;
    const rMm = parseNum(rStr);

    let incomplete = false;
    if (index == null && indexRaw.trim() !== "") {
      rowIssues.push({
        lineNumber,
        index: null,
        kind: "unconvertible",
        message: `Number neconvertibil: "${indexRaw}"`,
        rawLine: line,
      });
    }
    if (index == null && !indexRaw.trim()) {
      rowIssues.push({
        lineNumber,
        index: null,
        kind: "missing_number",
        message: "Number lipsește pe rând.",
        rawLine: line,
      });
    }
    if (pMPa == null || rMm == null) {
      incomplete = true;
      rowIssues.push({
        lineNumber,
        index,
        kind: pStr.trim() || rStr.trim() ? "unconvertible" : "incomplete",
        message: `Rând incomplet/neconvertibil (P="${pStr}", R="${rStr}"). Păstrat ca semnalat, fără eliminare automată din jurnal.`,
        rawLine: line,
      });
    }
    if (index != null) {
      if (seenNumbers.has(index)) {
        rowIssues.push({
          lineNumber,
          index,
          kind: "duplicate_number",
          message: `Number duplicat: ${index} (prima apariție linia ${seenNumbers.get(index)})`,
          rawLine: line,
        });
      } else {
        seenNumbers.set(index, lineNumber);
      }
    }

    devicePoints.push({
      index: index ?? devicePoints.length,
      time,
      pressureMPa: pMPa,
      dRiMm: dRi,
      radiusMm: rMm,
      incomplete,
    });
  }

  if (devicePoints.length === 0) {
    throw new Error("Nu s-au putut citi puncte de măsurare din fișier.");
  }

  // Puncte cu P+R valide → rawPoints (valori aparat) + volume calculat separat
  const validForCalc = devicePoints.filter(
    (p) => p.pressureMPa != null && p.radiusMm != null
  );
  const vols = volumeFromRadii(validForCalc.map((p) => p.radiusMm!));

  const rawPoints: RawPoint[] = validForCalc.map((p, i) => ({
    index: p.index,
    time: p.time,
    pressureMPa: p.pressureMPa,
    /** Conversie explicită reversibilă: kPa = MPa × 1000 */
    pressureKPa: p.pressureMPa! * 1000,
    dRiMm: p.dRiMm,
    radiusMm: p.radiusMm,
    volumeCm3: vols[i],
  }));

  if (metadata.dataSize != null && metadata.dataSize !== devicePoints.length) {
    warnings.push(
      `Data size din antet (${metadata.dataSize}) ≠ număr puncte citite (${devicePoints.length}). Verificați fișierul.`
    );
  } else if (metadata.dataSize != null) {
    warnings.push(
      `Data size confirmat: ${metadata.dataSize} = ${devicePoints.length} puncte citite.`
    );
  }

  const incompleteCount = devicePoints.filter((p) => p.incomplete).length;
  if (incompleteCount > 0) {
    warnings.push(
      `${incompleteCount} rând(uri) incomplete/neconvertibile semnalate (nu eliminate automat).`
    );
  }
  const dupes = rowIssues.filter((r) => r.kind === "duplicate_number").length;
  if (dupes > 0) {
    warnings.push(`${dupes} Number duplicate semnalate.`);
  }

  warnings.push(
    "Pressure[MPa], dRi[mm], R[mm] sunt valori exportate de aparat — nemodificate. ΔV (cm³) este calculat de FlexiPMT din R (celulă 0.60 m), nu e coloană Elast."
  );
  warnings.push(
    "Nu s-au reaplicat Factor A(1)/A(2)/G/dRi(A) pe datele exportate. În OYO recent, Kp/Ga erau scoase din calea de calcul pe P/V."
  );
  unconvertedFields.push(
    "ISO pe/δe (Anexa A) — neimplementat: lipsesc curbele de calibrare membrană complete"
  );

  const firstReading = rawPoints[0] ?? null;
  const lastReading = rawPoints[rawPoints.length - 1] ?? null;

  return {
    rawPoints,
    devicePoints,
    metadata,
    rowIssues,
    firstReading,
    lastReading,
    originalText,
    summary: {
      sourceFileName,
      sourceFormat: "elast-csv",
      importedAt: new Date().toISOString(),
      pointsImported: rawPoints.length,
      missingFields,
      unconvertedFields,
      warnings,
      correctionsAlreadyApplied: true,
      // Pressure/dRi/R din logger sunt deja „corectate” de aparat cu factorii înscriși;
      // FlexiPMT nu aplică din nou. Marcat true ca să nu se dubleze corecții.
    },
  };
}

export type ColumnMapping = {
  pressure: string;
  volume?: string;
  radius?: string;
  time?: string;
  index?: string;
  pressureUnit: "kPa" | "MPa";
};

export function parseMappedTable(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  sourceFileName: string
): { rawPoints: RawPoint[]; summary: ImportSummary } {
  const warnings: string[] = [];
  const points: RawPoint[] = [];
  const radii: number[] = [];

  rows.forEach((row, i) => {
    const pRaw = parseNum(row[mapping.pressure] ?? "");
    if (pRaw == null) return;
    const pressureKPa = mapping.pressureUnit === "MPa" ? pRaw * 1000 : pRaw;
    let volumeCm3 = mapping.volume ? parseNum(row[mapping.volume] ?? "") : null;
    const radiusMm = mapping.radius ? parseNum(row[mapping.radius] ?? "") : null;
    if (radiusMm != null) radii.push(radiusMm);
    if (volumeCm3 == null && radiusMm == null) {
      warnings.push(`Rând ${i + 1}: lipsește volum și rază — omis.`);
      return;
    }
    points.push({
      index: mapping.index ? parseNum(row[mapping.index] ?? "") ?? i : i,
      time: mapping.time ? row[mapping.time] || null : null,
      pressureMPa: pressureKPa / 1000,
      pressureKPa,
      dRiMm: null,
      radiusMm,
      volumeCm3: volumeCm3 ?? 0,
    });
  });

  if (
    points.every((p) => p.volumeCm3 === 0) &&
    radii.length === points.length
  ) {
    const vols = volumeFromRadii(radii);
    points.forEach((p, i) => {
      p.volumeCm3 = vols[i];
    });
    warnings.push("Volumul a fost calculat din rază.");
  }

  return {
    rawPoints: points,
    summary: {
      sourceFileName,
      sourceFormat: "csv-mapped",
      importedAt: new Date().toISOString(),
      pointsImported: points.length,
      missingFields: [],
      unconvertedFields: [],
      warnings,
      correctionsAlreadyApplied: false,
    },
  };
}
