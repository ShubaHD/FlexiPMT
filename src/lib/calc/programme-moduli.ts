/**
 * Module pe programe A/B/C/D — DOAR din selecție manuală pe grafic.
 * Nu atribuie automat puncte pentru GL1 / GUi / GRi / GURi / kf.
 */

import type { WorkingPoint, ComputedResult } from "@/lib/schema/pmt-v1";
import {
  passTimeToMinutes,
  segmentPressureCurve,
} from "@/lib/calc/segment-curve";
import {
  cavityVolumeCm3,
  computeGpbpOnSegment,
  computeKf,
  type MeasurementBasis,
} from "@/lib/calc/iso-formulae";
import type {
  FitIntervalOverride,
  LoadingProgramme,
  ProgrammeState,
} from "@/lib/calc/programme-types";
import { defaultProgrammeState } from "@/lib/calc/programme-types";

export type { FitIntervalOverride, LoadingProgramme, ProgrammeState };
export { defaultProgrammeState };
export type { ControllingParameter } from "@/lib/calc/programme-types";

export type ProgrammeCalcInput = {
  active: WorkingPoint[];
  psKPa: number | null;
  cellLengthM: number;
  state: ProgrammeState;
  rsMmFallback: number;
};

export type ProgrammeCalcOutput = {
  results: ComputedResult[];
  warnings: string[];
  state: ProgrammeState;
};

/** Chei de rezultat oferite utilizatorului, după program (fără pre-umplere). */
export function availableResultKeys(programme: LoadingProgramme): string[] {
  switch (programme) {
    case "A":
      // GUi/GRi până la 6 — inclusiv descărcarea finală ca următorul GUi (fără GRi dacă nu există reload)
      return [
        "GL1",
        "GU1",
        "GR1",
        "GU2",
        "GR2",
        "GU3",
        "GR3",
        "GU4",
        "GR4",
        "GU5",
        "GR5",
        "GU6",
      ];
    case "B":
      return [
        "GL1",
        "GUR1",
        "GUR2",
        "GUR3",
        "GUR4",
        "GUR5",
        "GU_final",
        // Exploratorii pe ramură — NU sunt GURi §6.4.3
        "GU1_exploratory",
        "GR1_exploratory",
      ];
    case "C":
      return ["kf"];
    case "D":
      return [
        "G_cycle1_exploratory",
        "G_cycle2_exploratory",
        "G_cycle3_exploratory",
        "G_cycle4_exploratory",
      ];
    case "custom":
      return ["GL1", "G_manual"];
    default:
      return [];
  }
}

export function resultKeyLabel(key: string): string {
  if (key === "GL1")
    return "GL1 — modul de forfecare pe prima încărcare (GPBP)";
  if (key === "kf") return "kf — coeficient de creep (program C)";
  if (key === "G_manual") return "G manual — modul pe interval selectat (6.3/6.4.1)";
  if (key === "GU_final")
    return "GU_final — modul pe descărcarea finală (§6.4.1, nu GUR B)";
  if (key === "EPBP")
    return "EPBP — modulul lui Young";
  if (key === "kWinkler_GL1")
    return "Estimare Winkler derivată din GL1";
  const krFrom = /^Kr_(.+)$/.exec(key);
  if (krFrom) return `Kᵣ(${krFrom[1]}) — rigiditate radială`;
  const epbpFrom = /^EPBP_(.+)$/.exec(key);
  if (epbpFrom) return `EPBP(${epbpFrom[1]}) — modulul lui Young`;
  const kbFrom = /^Kb_(.+)$/.exec(key);
  if (kbFrom) return `Kb(${kbFrom[1]}) — modulul volumic`;
  const epsFrom = /^E_plane_strain_(.+)$/.exec(key);
  if (epsFrom)
    return `E_plane_strain(${epsFrom[1]}) — modul Young (deformație plană)`;
  const mFrom = /^M_(.+)$/.exec(key);
  if (mFrom) return `M(${mFrom[1]}) — modul constrâns`;
  const mvFrom = /^mv_(.+)$/.exec(key);
  if (mvFrom) return `mv(${mvFrom[1]}) — 1/M`;
  const lamFrom = /^lambda_(.+)$/.exec(key);
  if (lamFrom) return `λ(${lamFrom[1]}) — parametrul Lamé`;
  const guExpl = /^GU(\d+)_exploratory$/.exec(key);
  if (guExpl)
    return `GU${guExpl[1]} — modul exploratoriu pe ramură de descărcare (nu GURi Program B)`;
  const grExpl = /^GR(\d+)_exploratory$/.exec(key);
  if (grExpl)
    return `GR${grExpl[1]} — modul exploratoriu pe ramură de reîncărcare (nu GURi Program B)`;
  const gu = /^GU(\d+)$/.exec(key);
  if (gu) return `GU${gu[1]} — modul de forfecare pe descărcare ${gu[1]} (GPBP)`;
  const gr = /^GR(\d+)$/.exec(key);
  if (gr) return `GR${gr[1]} — modul de forfecare pe reîncărcare ${gr[1]} (GPBP)`;
  const gur = /^GUR(\d+)$/.exec(key);
  if (gur)
    return `GUR${gur[1]} — modul pe bucla descărcare–reîncărcare ${gur[1]} (GPBP)`;
  const cy = /^G_cycle(\d+)_exploratory$/.exec(key);
  if (cy)
    return `G ciclu ${cy[1]} — modul exploratoriu (6.3/6.4.1 — nu specific D)`;
  return key;
}

/** Culori stabile pe rezultat (grafic + raport) */
export function resultKeyColor(key: string, indexInOverrides = 0): string {
  const palette = [
    "#c45c26",
    "#0f4c6e",
    "#1f5c3a",
    "#8a5a10",
    "#6b3fa0",
    "#8b2e2e",
    "#2a6f6f",
    "#5c3d2e",
  ];
  if (key === "GU_final") return "#6b3fa0";
  if (key.includes("exploratory")) return "#5b6b7c";
  return palette[indexInOverrides % palette.length];
}

export function rsAtPs(active: WorkingPoint[], psKPa: number | null, fallback: number): number {
  if (psKPa == null) return fallback;
  const hit = active.find((p) => p.pressureKPa >= psKPa);
  return hit?.radiusMm ?? fallback;
}

/** Mapare Number CSV → indice pe lista activă */
export function activeIndicesFromCsvNumbers(
  active: WorkingPoint[],
  csvNumbers: number[]
): number[] {
  const map = new Map<number, number>();
  active.forEach((p, i) => map.set(p.index, i));
  return [...new Set(csvNumbers)]
    .map((n) => map.get(n))
    .filter((i): i is number => i != null && i >= 0)
    .sort((a, b) => a - b);
}

export function csvNumbersFromActiveIndices(
  active: WorkingPoint[],
  indices: number[]
): number[] {
  return [...new Set(indices)]
    .filter((i) => i >= 0 && i < active.length)
    .sort((a, b) => a - b)
    .map((i) => active[i].index);
}

/** Doar selecție manuală. Preferă csvPointNumbers (stabil), apoi activeIndices. */
export function resolveManualSelection(
  active: WorkingPoint[],
  ov: FitIntervalOverride | null
): { pts: WorkingPoint[]; indices: number[]; csvPointNumbers: number[] } | null {
  if (!ov) return null;
  let indices: number[] = [];
  if (ov.csvPointNumbers && ov.csvPointNumbers.length > 0) {
    indices = activeIndicesFromCsvNumbers(active, ov.csvPointNumbers);
  } else if (ov.activeIndices && ov.activeIndices.length > 0) {
    indices = [...ov.activeIndices]
      .filter((i) => i >= 0 && i < active.length)
      .sort((a, b) => a - b);
  } else {
    const a = Math.min(ov.startIdx, ov.endIdx);
    const b = Math.max(ov.startIdx, ov.endIdx);
    for (let i = a; i <= b; i++) {
      if (i >= 0 && i < active.length) indices.push(i);
    }
  }
  if (indices.length < 2) return null;
  const csvPointNumbers = csvNumbersFromActiveIndices(active, indices);
  return { pts: indices.map((i) => active[i]), indices, csvPointNumbers };
}

/**
 * Verifică dacă selecția acoperă o buclă completă (toate punctele între start–end).
 * Folosit pentru Program B GURi — nu alege bucla automat.
 */
export function selectionCoversLoop(
  selectedIndices: number[],
  loopStartIdx: number,
  loopEndIdx: number
): boolean {
  if (selectedIndices.length === 0) return false;
  const need = new Set<number>();
  for (let i = loopStartIdx; i <= loopEndIdx; i++) need.add(i);
  if (need.size < 2) return false;
  const have = new Set(selectedIndices);
  for (const i of need) {
    if (!have.has(i)) return false;
  }
  return true;
}

/**
 * Estimează pi / p1.1 din extrema locală pe curba activă în jurul selecției
 * (doar pentru afișarea benzii 30–70% — nu atribuie puncte).
 */
export function estimateLoopPressuresAroundSelection(
  active: WorkingPoint[],
  indices: number[]
): { pi: number; p11: number; pLo: number; pHi: number } | null {
  if (indices.length === 0 || active.length === 0) return null;
  const i0 = Math.max(0, Math.min(...indices) - 8);
  const i1 = Math.min(active.length - 1, Math.max(...indices) + 8);
  let pi = -Infinity;
  let p11 = Infinity;
  for (let i = i0; i <= i1; i++) {
    const p = active[i].pressureKPa;
    if (p > pi) pi = p;
    if (p < p11) p11 = p;
  }
  if (!(pi > p11)) return null;
  const span = pi - p11;
  return {
    pi,
    p11,
    pLo: p11 + 0.3 * span,
    pHi: p11 + 0.7 * span,
  };
}

/**
 * Verificare A: punctele selectate ar trebui să fie în 30–70% din (pi…p1.1) local.
 */
export function checkProgrammeABand(
  key: string,
  active: WorkingPoint[],
  indices: number[],
  pts: WorkingPoint[]
): { outside: boolean; pLo: number; pHi: number; message: string | null } {
  if (!/^GU\d+$/.test(key) && !/^GR\d+$/.test(key)) {
    return { outside: false, pLo: 0, pHi: 0, message: null };
  }
  const est = estimateLoopPressuresAroundSelection(active, indices);
  if (!est) {
    return { outside: false, pLo: 0, pHi: 0, message: null };
  }
  const outside = pts.some(
    (p) => p.pressureKPa < est.pLo - 1 || p.pressureKPa > est.pHi + 1
  );
  return {
    outside,
    pLo: est.pLo,
    pHi: est.pHi,
    message: outside
      ? `${key}: selecție în afara benzii recomandate 30–70% (p ∈ [${(est.pLo / 1000).toFixed(3)}, ${(est.pHi / 1000).toFixed(3)}] MPa). Introduceți motivul.`
      : null,
  };
}

function gpbpFromManual(opts: {
  key: string;
  pts: WorkingPoint[];
  indices: number[];
  rsMm: number;
  vsCm3: number;
  basis: MeasurementBasis;
  programme: LoadingProgramme;
  ov: FitIntervalOverride;
  bandNote?: string | null;
}): ComputedResult {
  const press = opts.pts.map((p) => p.pressureKPa / 1000);
  const radial = opts.pts.map((p) => p.dRiMm ?? p.radiusMm ?? NaN);
  const vols = opts.pts.map((p) => p.volumeCm3);
  const out = computeGpbpOnSegment({
    pressureMPa: press,
    radialMm: radial,
    volumeCm3: vols,
    rsMm: opts.rsMm,
    vsCm3: opts.vsCm3,
    basis: opts.basis,
  });

  let reference = "ISO 22476-5:2023, 6.3 / 6.4.1";
  let noteParts: string[] = [
    `Selecție manuală · n=${opts.pts.length}`,
    opts.ov.author ? `autor ${opts.ov.author}` : null,
    opts.ov.at ? opts.ov.at.slice(0, 19) : null,
    opts.bandNote,
  ].filter(Boolean) as string[];

  if (opts.programme === "A") {
    if (opts.key === "GL1") reference = "ISO 22476-5:2023, 6.4.2 — GL1 (selecție manuală)";
    else if (/^GU\d+$/.test(opts.key))
      reference = "ISO 22476-5:2023, 6.4.2 — GUi (selecție manuală; recomandat 30–70%)";
    else if (/^GR\d+$/.test(opts.key))
      reference = "ISO 22476-5:2023, 6.4.2 — GRi (selecție manuală; recomandat 30–70%)";
    if (opts.ov.outsideStandardBand) {
      noteParts.push(
        `ABATERE bandă 30–70%: motiv ${opts.ov.reason || "nespecificat"}`
      );
    }
  } else if (opts.programme === "B") {
    if (opts.key === "GL1") reference = "ISO 22476-5:2023, 6.4.3 — GL1 (selecție manuală)";
    else if (opts.key === "GU_final") {
      reference =
        "ISO 22476-5:2023, 6.4.1 — modul pe descărcarea finală (suplimentar; NU GURi §6.4.3)";
      noteParts.push(
        "Rezultat suplimentar pe ramură de descărcare finală — nu este GURi Program B."
      );
    } else if (/_exploratory$/.test(opts.key)) {
      reference =
        "ISO 22476-5:2023, 6.4.1 — exploratoriu pe ramură (NU rezultatul GURi §6.4.3)";
      noteParts.push("Exploratoriu: nu înlocuiește GURi pe bucla completă.");
    } else if (/^GUR\d+$/.test(opts.key)) {
      reference = "ISO 22476-5:2023, 6.4.3 — GURi pe datele buclei";
      if (opts.ov.loopPointsExcluded) {
        noteParts.push(
          `ABATERE: analiză manuală pe subset (standardul cere bucla întreagă). Motiv: ${opts.ov.reason || "nespecificat"}`
        );
      }
    }
  } else if (opts.programme === "D") {
    reference =
      "ISO 22476-5:2023, 6.3 / 6.4.1 — exploratoriu; NU rezultat specific program D";
    noteParts.push("Marcat exploratoriu (metoda nu e definită explicit pentru D).");
  }

  if (out.slope != null) noteParts.push(`pantă=${out.slope.toExponential(4)}`);

  return {
    key: opts.key,
    label: resultKeyLabel(opts.key),
    value: out.gpbp,
    unit: "MPa",
    origin: "calculated",
    formula: out.formula,
    variables: out.variables,
    reference,
    dataInterval: `n=${opts.pts.length}; CSV Number=[${opts.pts.map((p) => p.index).join(",")}]; indici activi [${opts.indices.join(",")}]`,
    note: noteParts.join(" · "),
    slope: out.slope,
    usedActiveIndices: opts.indices,
    phaseLabel: "Selecție manuală",
  };
}

export function runProgrammeCalculations(
  input: ProgrammeCalcInput
): ProgrammeCalcOutput {
  const warnings: string[] = [];
  const { active, psKPa, cellLengthM, state } = input;
  const results: ComputedResult[] = [];

  // Segmentare doar informativă (sugestie program / bandă), NICIODATĂ pentru puncte de calcul
  const seg = segmentPressureCurve(active);
  const nextState: ProgrammeState = {
    ...state,
    phases: state.manualSegmentation ? state.phases : [],
    loops: state.manualSegmentation ? state.loops : [],
    suggestedProgramme: seg.suggestedProgramme,
    suggestionNote:
      (seg.suggestionNote || "") +
      " Sugestia nu selectează puncte — confirmați programul și selectați manual pe grafic.",
    loopCompliance: {
      requiredMin:
        state.programme === "A" ? 2 : state.programme === "B" ? 3 : null,
      observedComplete: seg.loops.filter((l) => l.complete).length,
      ok: true,
      message:
        state.programme === "A"
          ? `Program A: selectați manual GL1 / GUi / GRi. (Bucle detectate informativ: ${seg.loops.filter((l) => l.complete).length}; minim standard 2.)`
          : state.programme === "B"
            ? `Program B: selectați manual GL1 / GURi. (Bucle detectate informativ: ${seg.loops.filter((l) => l.complete).length}; minim standard 3.)`
            : state.programme === "C"
              ? "Program C: selectați manual punctele de menținere pentru kf."
              : state.programme === "D"
                ? "Program D: selectați manual punctele pe ciclu (rezultate exploratorii)."
                : "Selectați un program, apoi punctele pe grafic.",
    },
  };

  if (state.programme === "none") {
    warnings.push(
      "Niciun program selectat — nu există calcule GL1/GU/GR/GUR/kf. Alegeți programul și selectați punctele pe grafic."
    );
    return { results, warnings, state: nextState };
  }

  if (state.programme === "A" && nextState.loopCompliance.observedComplete < 2) {
    nextState.loopCompliance.ok = false;
    nextState.loopCompliance.message +=
      " Atenție: mai puțin de 2 bucle complete detectate informativ — verificați pe teren.";
  }
  if (state.programme === "B" && nextState.loopCompliance.observedComplete < 3) {
    nextState.loopCompliance.ok = false;
    nextState.loopCompliance.message +=
      " Atenție: mai puțin de 3 bucle complete detectate informativ.";
  }
  if (!nextState.loopCompliance.ok) warnings.push(nextState.loopCompliance.message);

  const rsMm = rsAtPs(active, psKPa, input.rsMmFallback);
  const vsCm3 = cavityVolumeCm3(rsMm, cellLengthM);
  const basis = state.measurementBasis;

  if (basis === "radial_displacement") {
    warnings.push(
      "CSV Elast: o singură valoare dRi — nu se afirmă media multi-traductor (ISO 6.3)."
    );
  }

  const allowed = new Set(availableResultKeys(state.programme));
  const overrides = state.fitOverrides.filter((o) => allowed.has(o.resultKey));

  if (overrides.length === 0) {
    warnings.push(
      "Nicio selecție manuală de puncte — rezultatele de modul apar după ce selectați zona pe grafic."
    );
  }

  for (const ov of overrides) {
    const sel = resolveManualSelection(active, ov);
    if (!sel) {
      warnings.push(`${ov.resultKey}: selecție insuficientă (minim 2 puncte).`);
      continue;
    }

    // Program C — kf
    if (state.programme === "C" && ov.resultKey === "kf") {
      if (state.controllingParameter !== "pressure") {
        warnings.push(
          "kf (Formula 7) se calculează doar când parametrul controlat este presiunea."
        );
        continue;
      }
      const pts = sel.pts;
      const t0 = passTimeToMinutes(pts[0]?.time);
      const t1 = passTimeToMinutes(pts[pts.length - 1]?.time);
      const d0 = pts[0]?.dRiMm ?? pts[0]?.radiusMm;
      const d1 = pts[pts.length - 1]?.dRiMm ?? pts[pts.length - 1]?.radiusMm;
      // Verificare presiune aproximativ constantă (menținere)
      const pSpan =
        Math.max(...pts.map((p) => p.pressureKPa)) -
        Math.min(...pts.map((p) => p.pressureKPa));
      if (pSpan > 80) {
        warnings.push(
          "kf: presiunea variază mult pe selecție — alegeți o perioadă de menținere."
        );
      }
      if (t0 == null || t1 == null || d0 == null || d1 == null) {
        warnings.push("kf: lipsesc Pass time sau dRi pe punctele selectate.");
        continue;
      }
      const dt = t1 - t0;
      const use = computeKf({
        delta1Mm: d0,
        delta2Mm: d1,
        t1Min: 0.01,
        t2Min: Math.max(0.02, dt > 0 ? dt : 0.02),
      });
      results.push({
        key: "kf",
        label: resultKeyLabel("kf"),
        value: use.kf,
        unit: "mm",
        origin: "calculated",
        formula: use.formula,
        variables: use.variables,
        reference: "ISO 22476-5:2023, 6.4.4 Formula (7) — selecție manuală",
        dataInterval: `n=${pts.length}; puncte #${pts.map((p) => p.index).join(",")}; indici [${sel.indices.join(",")}]`,
        note: `Selecție manuală din menținere · ${ov.author ?? "?"} · ${ov.at?.slice(0, 19) ?? ""}`,
        usedActiveIndices: sel.indices,
        phaseLabel: "Selecție manuală (menținere)",
      });
      continue;
    }

    let bandNote: string | null = null;
    let ovUse = ov;

    // A — bandă 30–70%
    if (
      state.programme === "A" &&
      (/^GU\d+$/.test(ov.resultKey) || /^GR\d+$/.test(ov.resultKey))
    ) {
      const bandCheck = checkProgrammeABand(
        ov.resultKey,
        active,
        sel.indices,
        sel.pts
      );
      if (bandCheck.pHi > bandCheck.pLo) {
        bandNote = `bandă recomandată 30–70%: p ∈ [${(bandCheck.pLo / 1000).toFixed(3)}, ${(bandCheck.pHi / 1000).toFixed(3)}] MPa`;
      }
      if (bandCheck.outside) {
        ovUse = { ...ov, outsideStandardBand: true };
        if (!ov.reason) {
          warnings.push(
            bandCheck.message ||
              `${ov.resultKey}: selecție în afara 30–70% — introduceți motivul.`
          );
        }
      }
    }

    // B — subset marcat
    if (
      state.programme === "B" &&
      /^GUR\d+$/.test(ov.resultKey) &&
      ov.loopPointsExcluded &&
      !ov.reason
    ) {
      warnings.push(
        `${ov.resultKey}: subset al buclei (abatere 6.4.3) — introduceți motivul.`
      );
    }

    results.push(
      gpbpFromManual({
        key: ov.resultKey,
        pts: sel.pts,
        indices: sel.indices,
        rsMm,
        vsCm3,
        basis,
        programme: state.programme,
        ov: ovUse,
        bandNote,
      })
    );
  }

  return { results, warnings, state: nextState };
}

export function clearManualSelections(state: ProgrammeState): ProgrammeState {
  return {
    ...state,
    fitOverrides: [],
    selectionTargetKey: null,
    manualSegmentation: false,
    phases: [],
    loops: [],
    segmentationAuthor: null,
    segmentationAt: null,
    segmentationReason: null,
  };
}

/** @deprecated — păstrat pentru compat; nu mai restaurează segmentare ca sursă de calcul */
export function resetToAutomaticSegmentation(
  state: ProgrammeState
): ProgrammeState {
  return clearManualSelections(state);
}

export function selectionToOverride(opts: {
  resultKey: string;
  activeIndices: number[];
  /** Puncte active — pentru a stoca Number CSV stabil */
  activePoints?: WorkingPoint[];
  csvPointNumbers?: number[];
  reason?: string | null;
  author?: string | null;
  outsideStandardBand?: boolean;
  loopPointsExcluded?: boolean;
}): FitIntervalOverride {
  const sorted = [...opts.activeIndices].sort((a, b) => a - b);
  const csv =
    opts.csvPointNumbers && opts.csvPointNumbers.length > 0
      ? [...opts.csvPointNumbers].sort((a, b) => a - b)
      : opts.activePoints
        ? csvNumbersFromActiveIndices(opts.activePoints, sorted)
        : undefined;
  return {
    resultKey: opts.resultKey,
    startIdx: sorted[0] ?? 0,
    endIdx: sorted[sorted.length - 1] ?? 0,
    activeIndices: sorted,
    csvPointNumbers: csv,
    outsideStandardBand: opts.outsideStandardBand,
    loopPointsExcluded: opts.loopPointsExcluded,
    reason: opts.reason ?? null,
    author: opts.author ?? null,
    at: new Date().toISOString(),
  };
}
