/**
 * Tipuri pentru interpretarea pe program A/B/C/D (fără dependențe circulare).
 */

import type { CurveLoop, CurvePhase } from "@/lib/calc/segment-curve";
import type { MeasurementBasis } from "@/lib/calc/iso-formulae";
import type { ChartTickSettings } from "@/lib/chart/chart-ticks";
import { defaultChartTickSettings } from "@/lib/chart/chart-ticks";

export type LoadingProgramme = "A" | "B" | "C" | "D" | "custom" | "none";
export type ControllingParameter = "pressure" | "radial_displacement" | "volume";
/** Reprezentare grafic: p–R implicit (comparabil OYO), p–D derivat, p–ΔV FlexiPMT */
export type ChartAxisMode = "p_R" | "p_D" | "p_dV";
export type { ChartTickSettings };

export type FitIntervalOverride = {
  resultKey: string;
  /** Primul/ultimul indice pe lista activă (compatibilitate / interval) */
  startIdx: number;
  endIdx: number;
  /**
   * Indici pe lista activă (fără excluse), ordine CSV.
   * Preferință secundară față de csvPointNumbers.
   */
  activeIndices?: number[];
  /**
   * Identificatori stabili = câmpul Number din CSV (WorkingPoint.index).
   * Preferat la salvare/redeschidere/raport.
   */
  csvPointNumbers?: number[];
  /** true = selecție în afara benzii ISO 30–70% (program A GUi/GRi) */
  outsideStandardBand?: boolean;
  /** true = program B: puncte excluse din bucla completă */
  loopPointsExcluded?: boolean;
  reason?: string | null;
  author?: string | null;
  at?: string | null;
};

export type ProgrammeState = {
  programme: LoadingProgramme;
  suggestedProgramme: LoadingProgramme | null;
  suggestionNote: string | null;
  programmeConfirmed: boolean;
  controllingParameter: ControllingParameter;
  measurementBasis: MeasurementBasis;
  phases: CurvePhase[];
  loops: CurveLoop[];
  fitOverrides: FitIntervalOverride[];
  /** Cheia rezultatului pentru care se editează selecția pe grafic (GL1, GU1, …) */
  selectionTargetKey: string | null;
  /** Axa X a graficului de interpretare (nu afectează calculele) */
  chartAxisMode: ChartAxisMode;
  /** Pași gradații X/Y (persistați; independenți de date/calcule) */
  chartTickSettings: ChartTickSettings;
  manualSegmentation: boolean;
  segmentationAuthor?: string | null;
  segmentationAt?: string | null;
  segmentationReason?: string | null;
  programmeDeviations: string | null;
  deviationReason: string | null;
  loopCompliance: {
    requiredMin: number | null;
    observedComplete: number;
    ok: boolean;
    message: string;
  };
  creepStartIdx: number | null;
  creepEndIdx: number | null;
};

export function defaultProgrammeState(): ProgrammeState {
  return {
    programme: "none",
    suggestedProgramme: null,
    suggestionNote: null,
    programmeConfirmed: false,
    controllingParameter: "pressure",
    measurementBasis: "radial_displacement",
    phases: [],
    loops: [],
    fitOverrides: [],
    selectionTargetKey: null,
    chartAxisMode: "p_R",
    chartTickSettings: defaultChartTickSettings(),
    manualSegmentation: false,
    programmeDeviations: null,
    deviationReason: null,
    loopCompliance: {
      requiredMin: null,
      observedComplete: 0,
      ok: true,
      message: "Program neselectat.",
    },
    creepStartIdx: null,
    creepEndIdx: null,
  };
}
