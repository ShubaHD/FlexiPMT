/**
 * Formule SR EN ISO 22476-5:2023, cl. 6.3 și 6.4.4.
 *
 * Formula (5) — deplasare radială:
 *   GPBP = (rs × Δp) / (2 × Δδ)
 *   (echivalent: GPBP = Δp / (2 εc), εc = Δδ/rs)
 *   rs, Δδ [mm]; Δp [MPa] → GPBP [MPa]
 *
 * Formula (6) — volum injectat:
 *   GPBP = Vs × (Δp / ΔV)
 *   Vs, ΔV [cm³]; Δp [MPa] → GPBP [MPa]
 *
 * Formula (7) — creep (program C, presiune menținută):
 *   kf = (δ2 − δ1) / log10(t2 / t1)
 *   δ [mm]; t [min] → kf [mm]
 *
 * Echivalență (5)↔(6) la deformații mici: ΔV ≈ 2 π rs L Δδ, Vs = π rs² L.
 */

export type MeasurementBasis = "radial_displacement" | "injected_volume";

export function linRegSlope(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 2) return null;
  let sx = 0,
    sy = 0,
    sxx = 0,
    sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
    sxx += xs[i] * xs[i];
    sxy += xs[i] * ys[i];
  }
  const den = n * sxx - sx * sx;
  if (Math.abs(den) < 1e-18) return null;
  return (n * sxy - sx * sy) / den;
}

/** Formula (5): pantă dp/dδ → GPBP = (rs/2) × slope */
export function gpbpFromRadialSlope(slopeDpDdMm: number, rsMm: number): number | null {
  if (!Number.isFinite(slopeDpDdMm) || !Number.isFinite(rsMm) || rsMm <= 0) return null;
  return (rsMm / 2) * slopeDpDdMm;
}

/** Formula (6): pantă dp/dV → GPBP = Vs × slope */
export function gpbpFromVolumeSlope(slopeDpDVol: number, vsCm3: number): number | null {
  if (!Number.isFinite(slopeDpDVol) || !Number.isFinite(vsCm3) || vsCm3 <= 0) return null;
  return vsCm3 * slopeDpDVol;
}

/**
 * GPBP pe un set de puncte (p [MPa], δ [mm] sau V [cm³]).
 * Pentru deplasare radială: Formula (5); pentru volum: Formula (6).
 */
export function computeGpbpOnSegment(opts: {
  pressureMPa: number[];
  radialMm?: number[] | null;
  volumeCm3?: number[] | null;
  rsMm: number;
  vsCm3: number;
  basis: MeasurementBasis;
}): { gpbp: number | null; slope: number | null; formula: string; variables: string } {
  const { pressureMPa, rsMm, vsCm3, basis } = opts;
  if (pressureMPa.length < 2) {
    return {
      gpbp: null,
      slope: null,
      formula: basis === "radial_displacement" ? "GPBP = (rs/2)×(Δp/Δδ)" : "GPBP = Vs×(Δp/ΔV)",
      variables: "n<2",
    };
  }

  if (basis === "radial_displacement") {
    const deltas = opts.radialMm;
    if (!deltas || deltas.length !== pressureMPa.length) {
      return {
        gpbp: null,
        slope: null,
        formula: "GPBP = (rs × Δp) / (2 × Δδ)  [ISO 22476-5:2023 Formula (5)]",
        variables: "δ lipsă",
      };
    }
    const slope = linRegSlope(deltas, pressureMPa);
    const gpbp = slope == null ? null : gpbpFromRadialSlope(slope, rsMm);
    return {
      gpbp,
      slope,
      formula: "GPBP = (rs × Δp) / (2 × Δδ)  [ISO 22476-5:2023 Formula (5)]",
      variables: `rs=${rsMm.toFixed(3)} mm; Δp [MPa]; Δδ [mm]; n=${pressureMPa.length}`,
    };
  }

  const vols = opts.volumeCm3;
  if (!vols || vols.length !== pressureMPa.length) {
    return {
      gpbp: null,
      slope: null,
      formula: "GPBP = Vs × (Δp/ΔV)  [ISO 22476-5:2023 Formula (6)]",
      variables: "ΔV lipsă",
    };
  }
  const slope = linRegSlope(vols, pressureMPa);
  const gpbp = slope == null ? null : gpbpFromVolumeSlope(slope, vsCm3);
  return {
    gpbp,
    slope,
    formula: "GPBP = Vs × (Δp/ΔV)  [ISO 22476-5:2023 Formula (6)]",
    variables: `Vs=${vsCm3.toFixed(3)} cm³; rs=${rsMm.toFixed(3)} mm; Δp [MPa]; ΔV [cm³]; n=${pressureMPa.length}`,
  };
}

/** Formula (7): kf = (δ2−δ1)/log10(t2/t1) */
export function computeKf(opts: {
  delta1Mm: number;
  delta2Mm: number;
  t1Min: number;
  t2Min: number;
}): { kf: number | null; formula: string; variables: string } {
  const { delta1Mm, delta2Mm, t1Min, t2Min } = opts;
  const formula = "kf = (δ2 − δ1) / log10(t2 / t1)  [ISO 22476-5:2023 Formula (7)]";
  if (!(t1Min > 0 && t2Min > t1Min)) {
    return {
      kf: null,
      formula,
      variables: `t1=${t1Min}, t2=${t2Min} — necesită t2>t1>0`,
    };
  }
  const den = Math.log10(t2Min / t1Min);
  if (Math.abs(den) < 1e-12) {
    return { kf: null, formula, variables: "log10(t2/t1)≈0" };
  }
  const kf = (delta2Mm - delta1Mm) / den;
  return {
    kf,
    formula,
    variables: `δ1=${delta1Mm.toFixed(4)} mm; δ2=${delta2Mm.toFixed(4)} mm; t1=${t1Min.toFixed(4)} min; t2=${t2Min.toFixed(4)} min`,
  };
}

/** Volum cavitate Vs = π r² L → cm³ (r mm, L m) */
export function cavityVolumeCm3(radiusMm: number, cellLengthM: number): number {
  const rM = radiusMm / 1000;
  return Math.PI * rM * rM * cellLengthM * 1e6;
}
