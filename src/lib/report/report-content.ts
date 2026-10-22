/**
 * Conținut raport client (ISO 22476-5:2023 clauza 7 — conținut minimal
 * din notele de proiect / Tabelele 5–10). Nu inventează formule sau corecții.
 */

import type {
  ComputedResult,
  CorrectionsStatus,
  PmtPayloadV1,
  RequiredInputs,
} from "@/lib/schema/pmt-v1";
import { defaultRequiredInputs } from "@/lib/schema/pmt-v1";
import type { FitIntervalOverride } from "@/lib/calc/programme-types";
import { activePoints } from "@/lib/schema/pmt-v1";

/** Nume fișier PDF: {foraj}_{adâncime}m_PMT */
export function reportPdfBaseName(
  boreholeCode: string,
  depthM: number | null | undefined
): string {
  const hole =
    String(boreholeCode || "foraj")
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "") || "foraj";
  const depth =
    depthM != null && Number.isFinite(depthM)
      ? `${Number(depthM).toFixed(2)}m`
      : "na";
  return `${hole}_${depth}_PMT`;
}

export type ReportGapKind =
  | "required_for_results"
  | "optional_result"
  | "operator_confirm";

export type ReportGap = {
  kind: ReportGapKind;
  message: string;
};

const MODULUS_KEY =
  /^(GL1|GU_final|GU\d+|GR\d+|GUR\d+|kf)(_exploratory)?$/;

/**
 * Ordine raport: GL1 → GUR1… → GU/GR → GU_final → exploratorii → kf;
 * apoi derivați pe aceeași ordine de bază (Kᵣ, EPBP, E_plane_strain, Kb, M, mv, λ).
 */
export function reportResultSortKey(
  key: string
): [number, number, number, number] {
  if (key === "kWinkler_GL1") {
    // După derivații din GL1
    return [1, 0, 0, 8];
  }
  const derived =
    /^(Kr|EPBP|E_plane_strain|Kb|M|mv|lambda)_(.+)$/.exec(key);
  if (derived) {
    const kindRank: Record<string, number> = {
      Kr: 0,
      EPBP: 1,
      E_plane_strain: 2,
      Kb: 3,
      M: 4,
      mv: 5,
      lambda: 6,
    };
    const [, kind, source] = derived;
    const [, srcFamily, srcNum] = reportResultSortKey(source);
    return [1, srcFamily, srcNum, kindRank[kind] ?? 9];
  }

  if (key === "GL1") return [0, 0, 0, 0];
  const gur = /^GUR(\d+)$/.exec(key);
  if (gur) return [0, 1, Number(gur[1]), 0];
  const gu = /^GU(\d+)$/.exec(key);
  if (gu) return [0, 2, Number(gu[1]), 0];
  const gr = /^GR(\d+)$/.exec(key);
  if (gr) return [0, 3, Number(gr[1]), 0];
  if (key === "GU_final") return [0, 4, 0, 0];
  const guExpl = /^GU(\d+)_exploratory$/.exec(key);
  if (guExpl) return [0, 5, Number(guExpl[1]), 0];
  const grExpl = /^GR(\d+)_exploratory$/.exec(key);
  if (grExpl) return [0, 6, Number(grExpl[1]), 0];
  const cy = /^G_cycle(\d+)_exploratory$/.exec(key);
  if (cy) return [0, 7, Number(cy[1]), 0];
  if (key === "G_manual") return [0, 8, 0, 0];
  if (key === "kf") return [0, 9, 0, 0];
  return [0, 99, 0, 0];
}

export function sortResultsForReport<T extends { key: string }>(
  rows: T[]
): T[] {
  return [...rows].sort((a, b) => {
    const ka = reportResultSortKey(a.key);
    const kb = reportResultSortKey(b.key);
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] !== kb[i]) return ka[i] - kb[i];
    }
    return a.key.localeCompare(b.key);
  });
}

/** Rezultate de modul / kf din program (fără previzualizări). */
export function programmeModulusResults(
  results: ComputedResult[]
): ComputedResult[] {
  return sortResultsForReport(
    results.filter((r) => MODULUS_KEY.test(r.key))
  );
}

/** Parametri derivați (Kᵣ, EPBP, Kb, E_plane_strain, M, mv, λ, k_Winkler). */
export function derivedParameterResults(
  results: ComputedResult[]
): ComputedResult[] {
  return results.filter(
    (r) =>
      r.value != null &&
      Number.isFinite(r.value) &&
      (/^(Kr|EPBP|Kb|E_plane_strain|M|mv|lambda)_/.test(r.key) ||
        r.key === "kWinkler_GL1")
  );
}

/**
 * Derivați pentru tipărire: doar dacă utilizatorul a bifat „Include în raport”.
 */
export function reportDerivedParameterResults(
  payload: PmtPayloadV1
): ComputedResult[] {
  const ri = {
    ...defaultRequiredInputs(),
    ...(payload.requiredInputs ?? {}),
  };
  if (!ri.includeDerivedInReport) return [];
  const allowed = new Set(ri.derivedSourceKeys ?? []);
  return sortResultsForReport(
    derivedParameterResults(payload.results ?? []).filter((r) => {
      if (r.key === "kWinkler_GL1") return true;
      const m = /^(?:Kr|EPBP|Kb|E_plane_strain|M|mv|lambda)_(.+)$/.exec(r.key);
      return m != null && (allowed.size === 0 || allowed.has(m[1]));
    })
  );
}

/** @deprecated folosiți derivedParameterResults */
export function epbpResults(results: ComputedResult[]): ComputedResult[] {
  return derivedParameterResults(results).filter((r) =>
    r.key.startsWith("EPBP_")
  );
}

export function usesInjectedVolumeBasis(payload: PmtPayloadV1): boolean {
  return payload.programmeState?.measurementBasis === "injected_volume";
}

export function usesFormula5(payload: PmtPayloadV1): boolean {
  const basis = payload.programmeState?.measurementBasis;
  if (basis === "injected_volume") return false;
  return programmeModulusResults(payload.results ?? []).some((r) =>
    (r.formula ?? "").includes("Formula (5)")
  );
}

export function usesFormula6(payload: PmtPayloadV1): boolean {
  if (usesInjectedVolumeBasis(payload)) {
    return programmeModulusResults(payload.results ?? []).length > 0;
  }
  return programmeModulusResults(payload.results ?? []).some((r) =>
    (r.formula ?? "").includes("Formula (6)")
  );
}

/** Formule unice folosite de rezultatele de modul raportate. */
export function usedFormulas(payload: PmtPayloadV1): string[] {
  const mods = [
    ...programmeModulusResults(payload.results ?? []),
    ...derivedParameterResults(payload.results ?? []),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of mods) {
    const f = (r.formula ?? "").trim();
    if (!f || seen.has(f)) continue;
    seen.add(f);
    out.push(f);
  }
  return out;
}

/**
 * Rezumat Number CSV: n=36, puncte 71–106 (sau mai multe intervale).
 * Lista completă rămâne în fitOverrides / audit.
 */
export function summarizeCsvNumbers(nums: number[]): string {
  const sorted = [
    ...new Set(nums.filter((n) => Number.isFinite(n)).map((n) => Math.round(n))),
  ].sort((a, b) => a - b);
  if (sorted.length === 0) return "n=0";
  const ranges: string[] = [];
  let start = sorted[0]!;
  let prev = sorted[0]!;
  for (let i = 1; i < sorted.length; i++) {
    const v = sorted[i]!;
    if (v === prev + 1) {
      prev = v;
      continue;
    }
    ranges.push(start === prev ? `${start}` : `${start}–${prev}`);
    start = v;
    prev = v;
  }
  ranges.push(start === prev ? `${start}` : `${start}–${prev}`);
  return `n=${sorted.length}, puncte ${ranges.join(", ")}`;
}

export function csvNumbersForOverride(
  ov: FitIntervalOverride,
  payload: PmtPayloadV1
): number[] {
  if (ov.csvPointNumbers?.length) return [...ov.csvPointNumbers];
  const active = activePoints(payload.workingPoints);
  if (ov.activeIndices?.length) {
    return ov.activeIndices
      .map((i) => active[i]?.index)
      .filter((n): n is number => n != null);
  }
  return [];
}

export function formatMPaFromKPa(kPa: number | null | undefined): string {
  if (kPa == null || !Number.isFinite(kPa)) return "—";
  // Fără separator de mii (ro-RO ar afișa 3354 ca „3.354”, confuz cu MPa)
  const kPaStr =
    Math.abs(kPa - Math.round(kPa)) < 1e-6
      ? String(Math.round(kPa))
      : kPa.toFixed(1);
  return `${(kPa / 1000).toFixed(3)} MPa (${kPaStr} kPa)`;
}

/** Text unic pentru raport — fără afirmații neconfirmate despre corecții Elast. */
export const CALIBRATION_REPORT_STATEMENT =
  "Valorile Pressure, dRi și R exportate de Elast Logger 3 reflectă calibrarea aparatului efectuată înaintea încercării. FlexiPMT le preia și le păstrează fără modificări și nu reaplică aceleași calibrări. Factorii înregistrați în fișierul testului sunt incluși pentru trasabilitate.";

/** Factori A(1)/A(2)/G/dRi(A) din antet, o singură dată — sau null dacă lipsesc. */
export function elastFactorTraceLine(
  payload: PmtPayloadV1
): string | null {
  const f =
    payload.elastMeta?.factors ?? payload.testFactors ?? null;
  if (!f) return null;
  const parts = [
    f.factorA1 != null
      ? `A(1) — factor presiune (pantă)=${f.factorA1}`
      : null,
    f.factorA2 != null
      ? `A(2) — factor presiune (offset)=${f.factorA2}`
      : null,
    f.factorG != null ? `G — gain rază (R)=${f.factorG}` : null,
    f.factorDriA != null
      ? `dRi(A) — factor deplasare radială=${f.factorDriA}`
      : null,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return parts.join("; ");
}

/** @deprecated folosiți CALIBRATION_REPORT_STATEMENT + elastFactorTraceLine */
export type CalibrationRow = {
  parameter: string;
  value: string;
  source: string;
  appliedBy: string;
  status: string;
};

/** @deprecated */
export function buildCalibrationRows(payload: PmtPayloadV1): CalibrationRow[] {
  const line = elastFactorTraceLine(payload);
  if (!line) return [];
  return [
    {
      parameter: "Factori din fișierul testului",
      value: line,
      source: "Antet Elast Logger",
      appliedBy: "Trasabilitate",
      status: "Fără reaplicare în FlexiPMT",
    },
  ];
}

export function correctionsStatusLabel(status: CorrectionsStatus): string {
  switch (status) {
    case "applied_by_elast":
      return "Stare înregistrată: applied_by_elast (fără verificare independentă FlexiPMT)";
    case "not_applied":
      return "Neaplicat în FlexiPMT";
    case "unverified":
    default:
      return "Neverificat independent în FlexiPMT";
  }
}

/** Clasifică golurile pentru UI raport (blocante + opționale). */
export function classifyReportGaps(payload: PmtPayloadV1): ReportGap[] {
  const ri: RequiredInputs = {
    ...defaultRequiredInputs(),
    ...(payload.requiredInputs ?? {}),
  };
  const gaps: ReportGap[] = [];
  const volBasis = usesInjectedVolumeBasis(payload);
  const prog =
    payload.programmeState?.programme ??
    payload.interpretation?.programme ??
    "none";
  const hasPs =
    ri.psCsvPointNumber != null ||
    (ri.psManualKPa != null && Number.isFinite(ri.psManualKPa));
  const hasSelections =
    (payload.programmeState?.fitOverrides?.length ?? 0) > 0;

  if (payload.workingPoints.length === 0) {
    gaps.push({
      kind: "required_for_results",
      message: "Puncte de măsurare",
    });
  }

  if (!prog || prog === "none") {
    gaps.push({
      kind: "required_for_results",
      message: "Program de încărcare (A/B/C/D) — selectat",
    });
  } else if (
    payload.programmeState &&
    !payload.programmeState.programmeConfirmed
  ) {
    gaps.push({
      kind: "operator_confirm",
      message: "Confirmarea programului de încărcare de către operator",
    });
  }

  if (prog && prog !== "none") {
    if (!hasPs) {
      gaps.push({
        kind: "operator_confirm",
        message:
          "ps: selectați punctul de așezare pe grafic (Number CSV + presiune)",
      });
    }
    if (!hasSelections) {
      gaps.push({
        kind: "required_for_results",
        message: "Selecție manuală pe grafic pentru cel puțin un rezultat",
      });
    }
  }

  if (volBasis || usesFormula6(payload)) {
    if (ri.cellLengthM == null) {
      gaps.push({
        kind: "required_for_results",
        message:
          "Lungime celulă activă [m] — necesară pentru Formula (6) / Vs",
      });
    } else if (!ri.cellLengthConfirmed) {
      gaps.push({
        kind: "operator_confirm",
        message: "Confirmarea lungimii celulei active folosite la Vs/ΔV",
      });
    }
  }

  if (ri.computeEpbp) {
    if (ri.poisson == null) {
      gaps.push({
        kind: "required_for_results",
        message: "ν (Poisson) — necesar pentru parametrii derivați",
      });
    }
    if ((ri.derivedSourceKeys?.length ?? 0) === 0) {
      gaps.push({
        kind: "required_for_results",
        message: "Bază GPBP pentru derivați — bifați GL1 / GUR…",
      });
    }
  } else {
    gaps.push({
      kind: "optional_result",
      message:
        "Parametri derivați — alegeți baza (GL1/GUR…), ν, calculați; bifați includerea în raport",
    });
  }

  if (ri.apparatusLimitKPa == null) {
    gaps.push({
      kind: "optional_result",
      message:
        "Limită practică — opțională pentru concluzia de limită (nu blochează modulele)",
    });
  }

  return gaps;
}

/** Goluri care blochează „verificat” (obligatorii + confirmări). */
export function blockingReportGaps(payload: PmtPayloadV1): ReportGap[] {
  return classifyReportGaps(payload).filter(
    (g) =>
      g.kind === "required_for_results" || g.kind === "operator_confirm"
  );
}

/** Selecții manuale rezumate pentru tipărire. */
export function selectionSummaries(payload: PmtPayloadV1): {
  key: string;
  summary: string;
  reason: string | null;
  outsideBand: boolean;
  loopSubset: boolean;
}[] {
  const ovs = payload.programmeState?.fitOverrides ?? [];
  return ovs.map((ov) => ({
    key: ov.resultKey,
    summary: summarizeCsvNumbers(csvNumbersForOverride(ov, payload)),
    reason: ov.reason ?? null,
    outsideBand: Boolean(ov.outsideStandardBand),
    loopSubset: Boolean(ov.loopPointsExcluded),
  }));
}

/** Chart mode for report: avoid undocumented ΔV if cell length unconfirmed. */
export function reportChartAxisMode(
  payload: PmtPayloadV1
): "p_R" | "p_D" | "p_dV" {
  const mode = payload.programmeState?.chartAxisMode ?? "p_R";
  if (mode !== "p_dV") return mode;
  const ri = payload.requiredInputs ?? defaultRequiredInputs();
  if (ri.cellLengthM != null && ri.cellLengthConfirmed) return "p_dV";
  return "p_R";
}
