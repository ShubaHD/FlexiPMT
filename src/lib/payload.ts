import type { HistoryEntry, PmtPayloadV1 } from "@/lib/schema/pmt-v1";
import {
  defaultRequiredInputs,
  emptyPayload,
  SCHEMA_VERSION,
} from "@/lib/schema/pmt-v1";
import { defaultProgrammeState } from "@/lib/calc/programme-types";
import {
  normalizeChartTickSettings,
  type ChartTickSettings,
} from "@/lib/chart/chart-ticks";
import { runCalculations, validatePoints } from "@/lib/calc/pressuremeter";

export function parsePayload(json: string): PmtPayloadV1 {
  try {
    const raw = JSON.parse(json || "{}") as Partial<PmtPayloadV1>;
    if (!raw || typeof raw !== "object") return emptyPayload();
    const base = emptyPayload();
    return {
      ...base,
      ...raw,
      schemaVersion: SCHEMA_VERSION,
      rawPoints: raw.rawPoints ?? [],
      workingPoints: raw.workingPoints ?? [],
      calibration: { ...base.calibration, ...(raw.calibration ?? {}) },
      interpretation: {
        ...base.interpretation,
        ...(raw.interpretation ?? {}),
      },
      results: raw.results ?? [],
      importSummary: raw.importSummary ?? null,
      selectedPointId: raw.selectedPointId ?? null,
      elastMeta: raw.elastMeta ?? null,
      testFactors: raw.testFactors ?? null,
      rowIssues: raw.rowIssues ?? [],
      originalCsvText: raw.originalCsvText ?? null,
      requiredInputs: (() => {
        const base = defaultRequiredInputs();
        const rawRi = raw.requiredInputs ?? {};
        return {
          ...base,
          ...rawRi,
          derivedSourceKeys: Array.isArray(rawRi.derivedSourceKeys)
            ? rawRi.derivedSourceKeys.map(String)
            : base.derivedSourceKeys,
          includeDerivedInReport: Boolean(
            rawRi.includeDerivedInReport ?? base.includeDerivedInReport
          ),
        };
      })(),
      associatedCalibrations: raw.associatedCalibrations ?? [],
      reportStatus: raw.reportStatus ?? "draft",
      programmeState: (() => {
        const base = defaultProgrammeState();
        const rawPs = raw.programmeState ?? {};
        const rawTicks =
          rawPs &&
          typeof rawPs === "object" &&
          "chartTickSettings" in rawPs
            ? (rawPs.chartTickSettings as Partial<ChartTickSettings> | null)
            : undefined;
        return {
          ...base,
          ...rawPs,
          chartTickSettings: normalizeChartTickSettings(rawTicks),
        };
      })(),
      correctionsStatus: raw.correctionsStatus ?? "unverified",
      correctionsStatusNote:
        raw.correctionsStatusNote ?? base.correctionsStatusNote,
    };
  } catch {
    return emptyPayload();
  }
}

export function parseHistory(json: string): HistoryEntry[] {
  try {
    const h = JSON.parse(json || "[]");
    return Array.isArray(h) ? h : [];
  } catch {
    return [];
  }
}

export function pushHistory(
  history: HistoryEntry[],
  action: string,
  detail?: string,
  author?: string
): HistoryEntry[] {
  return [
    {
      at: new Date().toISOString(),
      action,
      detail: detail ?? null,
      author: author ?? null,
    },
    ...history,
  ].slice(0, 200);
}

export function recomputePayload(payload: PmtPayloadV1): {
  payload: PmtPayloadV1;
  warnings: string[];
  issues: string[];
  missingRequired: string[];
} {
  const issues = validatePoints(payload.workingPoints);
  const cal = { ...payload.calibration };
  const {
    interpretation,
    results,
    warnings,
    missingRequired,
    reportStatus,
    programmeState,
  } = runCalculations({
    points: payload.workingPoints,
    calibration: cal,
    interpretation: payload.interpretation,
    requiredInputs: payload.requiredInputs,
    programmeState: payload.programmeState,
    correctionsStatus: payload.correctionsStatus,
    correctionsStatusNote: payload.correctionsStatusNote,
  });
  return {
    payload: {
      ...payload,
      calibration: cal,
      interpretation,
      results,
      reportStatus,
      programmeState,
    },
    warnings,
    issues,
    missingRequired,
  };
}
