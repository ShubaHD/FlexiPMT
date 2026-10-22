/**
 * Schema internă FlexiPMT v1 — date versionate, migrabile.
 * Surse: OYO-App (.oyo pickle), Elast Logger 3 CSV, ISO 22476-5:2023 (formule mapate).
 */

import type { ElastDeviceFactors, ElastMetadata, RowIssue } from "@/lib/import/elast-csv";
import type { ParsedCalibrationFile } from "@/lib/import/calibration-csv";
import type { ProgrammeState } from "@/lib/calc/programme-types";
import { defaultProgrammeState } from "@/lib/calc/programme-types";

export const SCHEMA_VERSION = 1 as const;
export const APP_VERSION = "0.3.0";

/** Stare corecții pe / δe / ΔVe (Anexa A) — fără presupoziții */
export type CorrectionsStatus =
  | "applied_by_elast"
  | "not_applied"
  | "unverified";

export type PointStatus = "active" | "excluded" | "edited";
export type ValueOrigin =
  | "measured"
  | "calculated"
  | "manual"
  | "imported"
  | "unavailable";
export type TestStatus =
  | "DRAFT"
  | "IN_PROGRESS"
  | "VERIFIED"
  | "FINALIZED"
  | "IMPORTED";
export type ReportStatus = "draft" | "incomplete" | "verified";

export type RawPoint = {
  index: number;
  time?: string | null;
  /** Presiune citită (MPa) din logger — unitate originală */
  pressureMPa?: number | null;
  /** Conversie explicită: kPa = MPa × 1000 (reversibilă) */
  pressureKPa: number;
  dRiMm?: number | null;
  radiusMm?: number | null;
  /** ΔV calculat de FlexiPMT (nu export aparat) */
  volumeCm3: number;
};

export type WorkingPoint = RawPoint & {
  id: string;
  status: PointStatus;
  originalPressureKPa?: number | null;
  originalVolumeCm3?: number | null;
  excludeReason?: string | null;
};

export type Calibration = {
  kp: number;
  ga: number;
  radiusMm: number;
  poisson: number;
  /** true = nu reaplica corecții pe datele importate */
  correctionsAlreadyApplied: boolean;
  notes?: string | null;
};

export type Interpretation = {
  psKPa: number | null;
  psOrigin: ValueOrigin;
  pMaxKPa: number | null;
  pMaxOrigin: ValueOrigin;
  rupturePressureKPa: number | null;
  ruptureOrigin: ValueOrigin;
  apparatusLimitKPa: number | null;
  apparatusLimitReachedWithoutRupture: boolean;
  apparatusLimitNote?: string | null;
  fitStartIdx: number | null;
  fitEndIdx: number | null;
  /** @deprecated folosiți programmeState.programme */
  programme: "none" | "A" | "B" | "C" | "D" | "custom";
};

export type ComputedResult = {
  key: string;
  label: string;
  value: number | null;
  unit: string;
  origin: ValueOrigin;
  reference?: string | null;
  note?: string | null;
  formula?: string | null;
  variables?: string | null;
  dataInterval?: string | null;
  /** Pantă din regresia pe punctele selectate (dp/dδ sau dp/dV) */
  slope?: number | null;
  /** Indici pe lista activă (ordine CSV) folosiți la calcul */
  usedActiveIndices?: number[];
  /** Fază / buclă asociată (etichetă) */
  phaseLabel?: string | null;
};

export type TubeSizeCode = "BX" | "NX";
export type PackerHardnessCode = "Hard" | "Soft";
export type ProbeModelCode = "digital_sonde_4301" | "hq_4180" | "other";

/** Date obligatorii pentru rezultat „verificat” — introduse de utilizator */
export type RequiredInputs = {
  /** ν — coeficient Poisson (adimensional), utilizator */
  poisson: number | null;
  /**
   * Lungime celulă activă [m] — pentru ΔV / Vs.
   * Nu se deduce din lungimea totală a sondei; necesită confirmare.
   */
  cellLengthM: number | null;
  /** Operatorul a confirmat lungimea celulei active folosită la ΔV */
  cellLengthConfirmed: boolean;
  /**
   * Limita practică admisă pentru configurația testului [kPa].
   * Checkbox-ul „limită atinsă” se raportează la aceasta (nu la nominal 20 MPa).
   */
  apparatusLimitKPa: number | null;
  /** Presiune maximă nominală aparat/sondă [kPa], ex. 20 MPa = 20 000 kPa */
  nominalMaxPressureKPa: number | null;
  /** Operatorul a confirmat limita practică (tabelul e doar orientativ) */
  practicalLimitConfirmed: boolean;
  /** Tip tub BX/NX (precompletat din CSV Tube type, de confirmat) */
  tubeSize: TubeSizeCode | null;
  /** Hard / Soft (litera H/S din Tube type) */
  packerHardness: PackerHardnessCode | null;
  /** Diametru packer [mm]: 60 (BX), 70 (NX); 80/100 doar dacă modelul e compatibil */
  packerDiameterMm: number | null;
  /** Model sondă — controlează opțiunile de packer */
  probeModel: ProbeModelCode | null;
  /** Valoare brută Tube type din CSV */
  tubeTypeFromCsv: string | null;
  /** Confirmare operator pentru tip tub / Hard-Soft / packer */
  tubeConfigConfirmed: boolean;
  /** ps manual (kPa) — din punct CSV sau tastat */
  psManualKPa: number | null;
  /** Number CSV al punctului de așezare ales pe grafic */
  psCsvPointNumber: number | null;
  /**
   * @deprecated Estimarea automată ps nu mai e în fluxul principal.
   * Păstrat pentru payload-uri vechi; UI nu o mai oferă.
   */
  acceptAutoPs: boolean;
  /**
   * @deprecated Intervalul de fit = selecțiile pe grafic (CSV Number).
   * Câmpuri legacy; nu se mai cer în UI.
   */
  fitStartIdx: number | null;
  fitEndIdx: number | null;
  /** Opțional — inclus în raport dacă e completat */
  operatorName: string | null;
  notes: string | null;
  /** Dacă true, se calculează parametrii derivați (necesită ν + derivedSourceKeys) */
  computeEpbp: boolean;
  /**
   * Baze GPBP alese pentru derivați (ex. GL1, GUR1, GUR2).
   * Gol = nu se calculează derivați.
   */
  derivedSourceKeys: string[];
  /** Dacă true, parametrii derivați calculați apar în raportul PDF. */
  includeDerivedInReport: boolean;
  /**
   * Dacă true, calculează k_Winkler = E/(rs×(1−ν²)) din GL1
   * (convenție program vechi; opțional).
   */
  computeKWinkler: boolean;
  /**
   * Diametrul forajului la nivelul testului [mm] — contact geometric + tabel limite.
   */
  boreholeDiameterMm: number | null;
};

export type AssociatedCalibration = {
  associatedAt: string;
  file: ParsedCalibrationFile;
  factorDiffWarnings: string[];
};

export type HistoryEntry = {
  at: string;
  action: string;
  detail?: string | null;
  author?: string | null;
};

export type ImportSummary = {
  sourceFileName: string;
  sourceFormat: "oyo-json" | "elast-csv" | "csv-mapped" | "xlsx-mapped" | "manual";
  importedAt: string;
  pointsImported: number;
  missingFields: string[];
  unconvertedFields: string[];
  warnings: string[];
  correctionsAlreadyApplied: boolean;
};

export type PmtPayloadV1 = {
  schemaVersion: typeof SCHEMA_VERSION;
  rawPoints: RawPoint[];
  workingPoints: WorkingPoint[];
  calibration: Calibration;
  interpretation: Interpretation;
  results: ComputedResult[];
  importSummary?: ImportSummary | null;
  selectedPointId: string | null;
  /** Metadate Elast Logger */
  elastMeta?: ElastMetadata | null;
  /** Factorii din CSV-ul testului (copie) */
  testFactors?: ElastDeviceFactors | null;
  rowIssues?: RowIssue[];
  /** Text CSV original (trasabilitate) */
  originalCsvText?: string | null;
  requiredInputs?: RequiredInputs;
  associatedCalibrations?: AssociatedCalibration[];
  reportStatus?: ReportStatus;
  /** Interpretare pe program A/B/C/D (ISO 6.4) */
  programmeState?: ProgrammeState;
  /** Corecții pe, δe, ΔVe — Anexa A */
  correctionsStatus?: CorrectionsStatus;
  correctionsStatusNote?: string | null;
};

export function defaultCalibration(): Calibration {
  return {
    kp: 1,
    ga: 1,
    radiusMm: 35,
    poisson: 0.33,
    correctionsAlreadyApplied: false,
    notes: null,
  };
}

export function defaultInterpretation(): Interpretation {
  return {
    psKPa: null,
    psOrigin: "unavailable",
    pMaxKPa: null,
    pMaxOrigin: "unavailable",
    rupturePressureKPa: null,
    ruptureOrigin: "unavailable",
    apparatusLimitKPa: null,
    apparatusLimitReachedWithoutRupture: false,
    apparatusLimitNote: null,
    fitStartIdx: null,
    fitEndIdx: null,
    programme: "none",
  };
}

export function defaultRequiredInputs(): RequiredInputs {
  return {
    poisson: null,
    cellLengthM: null,
    cellLengthConfirmed: false,
    apparatusLimitKPa: null,
    nominalMaxPressureKPa: null,
    practicalLimitConfirmed: false,
    tubeSize: null,
    packerHardness: null,
    packerDiameterMm: null,
    probeModel: "digital_sonde_4301",
    tubeTypeFromCsv: null,
    tubeConfigConfirmed: false,
    psManualKPa: null,
    psCsvPointNumber: null,
    acceptAutoPs: false,
    fitStartIdx: null,
    fitEndIdx: null,
    operatorName: null,
    notes: null,
    computeEpbp: false,
    derivedSourceKeys: [],
    includeDerivedInReport: false,
    computeKWinkler: false,
    boreholeDiameterMm: null,
  };
}

export function emptyPayload(): PmtPayloadV1 {
  return {
    schemaVersion: SCHEMA_VERSION,
    rawPoints: [],
    workingPoints: [],
    calibration: defaultCalibration(),
    interpretation: defaultInterpretation(),
    results: [],
    importSummary: null,
    selectedPointId: null,
    elastMeta: null,
    testFactors: null,
    rowIssues: [],
    originalCsvText: null,
    requiredInputs: defaultRequiredInputs(),
    associatedCalibrations: [],
    reportStatus: "draft",
    programmeState: defaultProgrammeState(),
    correctionsStatus: "unverified",
    correctionsStatusNote:
      "FlexiPMT nu verifică independent corecțiile pe / δe / ΔVe din exportul Elast. Pressure, dRi și R rămân nemodificate; factorii din fișier sunt doar pentru trasabilitate.",
  };
}

export function rawToWorking(raw: RawPoint[]): WorkingPoint[] {
  return raw.map((p) => ({
    ...p,
    id: `pt-${p.index}`,
    status: "active" as const,
  }));
}

export function activePoints(points: WorkingPoint[]): WorkingPoint[] {
  return points.filter((p) => p.status !== "excluded");
}

/**
 * Goluri care blochează raportul „verificat” — doar câmpuri care participă
 * la rezultatele efectiv selectate. Limita practică / operator / note nu blochează.
 */
export function missingRequiredFields(payload: PmtPayloadV1): string[] {
  // Evită ciclu: logică oglindită din fields-needed (fără import circular la runtime)
  const ri = payload.requiredInputs ?? defaultRequiredInputs();
  const missing: string[] = [];
  const prog =
    payload.programmeState?.programme ??
    payload.interpretation?.programme ??
    "none";
  const volBasis =
    payload.programmeState?.measurementBasis === "injected_volume";
  const hasSelections =
    (payload.programmeState?.fitOverrides?.length ?? 0) > 0;
  const hasPs =
    ri.psCsvPointNumber != null ||
    (ri.psManualKPa != null && Number.isFinite(ri.psManualKPa));

  if (payload.workingPoints.length === 0) missing.push("Puncte de măsurare");

  if (!prog || prog === "none") {
    missing.push("Program de încărcare (A/B/C/D) — selectat");
  } else if (
    payload.programmeState &&
    !payload.programmeState.programmeConfirmed
  ) {
    missing.push("Confirmarea programului de încărcare de către operator");
  }

  if (prog && prog !== "none") {
    if (!hasPs) {
      missing.push(
        "ps: selectați punctul de așezare pe grafic (Number CSV + presiune)"
      );
    }
    if (!hasSelections) {
      missing.push(
        "Selecție manuală pe grafic pentru cel puțin un rezultat (GL1/GUi/…)"
      );
    }
  }

  if (volBasis) {
    if (ri.cellLengthM == null) {
      missing.push(
        "Lungime celulă activă [m] — necesară pentru Formula (6) / Vs"
      );
    } else if (!ri.cellLengthConfirmed) {
      missing.push(
        "Confirmarea lungimii celulei active folosite la Vs/ΔV"
      );
    }
  }

  if (ri.computeEpbp) {
    if (ri.poisson == null) {
      missing.push("ν (Poisson) — necesar pentru parametrii derivați");
    }
    if ((ri.derivedSourceKeys?.length ?? 0) === 0) {
      missing.push("Bază GPBP pentru derivați (GL1 / GUR…)");
    }
  }

  return missing;
}

export function deriveReportStatus(payload: PmtPayloadV1): ReportStatus {
  const missing = missingRequiredFields(payload);
  if (missing.length > 0) return "incomplete";
  if (payload.reportStatus === "verified") return "verified";
  return "draft";
}
