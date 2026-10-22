/**
 * Reprezentări grafice p–R / p–D / p–ΔV.
 * Schimbarea axei X nu afectează selecțiile sau calculele.
 */

import type { WorkingPoint } from "@/lib/schema/pmt-v1";
import type { ChartAxisMode } from "@/lib/calc/programme-types";

export type { ChartAxisMode };

export const CHART_AXIS_OPTIONS: {
  value: ChartAxisMode;
  label: string;
  xUnit: string;
  note: string;
}[] = [
  {
    value: "p_R",
    label: "p–R [MPa, mm]",
    xUnit: "R (mm)",
    note: "Presiune–rază — reprezentare implicită, comparabilă cu raportul OYO.",
  },
  {
    value: "p_D",
    label: "p–D [MPa, mm]",
    xUnit: "D (mm)",
    note: "Diametru D = 2×R (derivat; R original rămâne nemodificat).",
  },
  {
    value: "p_dV",
    label: "p–ΔV [MPa, cm³]",
    xUnit: "ΔV (cm³)",
    note: "ΔV este calculat de FlexiPMT din R și lungimea celulei — nu e coloană de volum măsurată de Elast Logger.",
  },
];

/** Coordonata X pe grafic (ordine CSV neschimbată). */
export function chartXValue(
  p: Pick<WorkingPoint, "radiusMm" | "volumeCm3">,
  mode: ChartAxisMode
): number | null {
  if (mode === "p_R") {
    return p.radiusMm != null && Number.isFinite(p.radiusMm) ? p.radiusMm : null;
  }
  if (mode === "p_D") {
    return p.radiusMm != null && Number.isFinite(p.radiusMm)
      ? 2 * p.radiusMm
      : null;
  }
  return Number.isFinite(p.volumeCm3) ? p.volumeCm3 : null;
}

export function chartAxisLabel(mode: ChartAxisMode): string {
  return CHART_AXIS_OPTIONS.find((o) => o.value === mode)?.xUnit ?? "x";
}

export function chartAxisNote(mode: ChartAxisMode): string {
  return CHART_AXIS_OPTIONS.find((o) => o.value === mode)?.note ?? "";
}

/**
 * Reper „contact geometric estimat”:
 * - p–R: R = D_foraj / 2
 * - p–D: D = D_foraj
 * Necesită diametru foraj și R disponibil pe cură.
 */
export function geometricContactMarker(
  mode: ChartAxisMode,
  boreholeDiameterMm: number | null | undefined,
  hasRadiusData: boolean
): { x: number; label: string } | { missing: string } | null {
  if (mode === "p_dV") return null;
  if (!hasRadiusData) {
    return {
      missing:
        "Reperul de contact geometric necesită valori R pe curbă. Acestea lipsesc sau nu sunt confirmate.",
    };
  }
  if (boreholeDiameterMm == null || !(boreholeDiameterMm > 0)) {
    return {
      missing:
        "Introduceți „Diametrul forajului la nivelul testului [mm]” pentru a afișa contactul geometric estimat. ΔV=0 nu este folosit ca moment de contact.",
    };
  }
  if (mode === "p_R") {
    return {
      x: boreholeDiameterMm / 2,
      label: "contact geometric estimat (R = D_foraj/2)",
    };
  }
  return {
    x: boreholeDiameterMm,
    label: "contact geometric estimat (D = D_foraj)",
  };
}
