/**
 * Segmentare automată a curbei presiometrice în faze și bucle.
 * Nu modifică punctele originale — doar indici pe lista activă.
 */

import type { WorkingPoint } from "@/lib/schema/pmt-v1";

export type PhaseKind =
  | "loading"
  | "unloading"
  | "reloading"
  | "hold"
  | "final_unload"
  | "other";

export type CurvePhase = {
  id: string;
  kind: PhaseKind;
  /** Indici în lista de puncte active (inclusive) */
  startIdx: number;
  endIdx: number;
  /** Numere de punct din CSV (trasabilitate) */
  pointIndices: number[];
  pStartKPa: number;
  pEndKPa: number;
  label: string;
  /** true dacă limitele au fost mutate manual */
  manual: boolean;
};

export type CurveLoop = {
  id: string;
  index: number; // 1-based
  unloadPhaseId: string;
  reloadPhaseId: string | null;
  holdPhaseId: string | null;
  /** Presiune de inversare pi (max înainte de descărcare) [kPa] */
  piKPa: number;
  /** Presiune minimă în buclă p1.1 [kPa] */
  p11KPa: number;
  /** Indici activi pe întreaga buclă (unload…reload) */
  startIdx: number;
  endIdx: number;
  complete: boolean;
  label: string;
};

export type SegmentationResult = {
  phases: CurvePhase[];
  loops: CurveLoop[];
  suggestedProgramme: "A" | "B" | "C" | "D" | "custom" | null;
  suggestionNote: string;
};

const DP_EPS_KPA = 15; // ~0.015 MPa — zgomot tipic
const HOLD_MAX_DP_KPA = 40;
const MIN_PHASE_POINTS = 2;

function directionOf(dp: number): "up" | "down" | "flat" {
  if (dp > DP_EPS_KPA) return "up";
  if (dp < -DP_EPS_KPA) return "down";
  return "flat";
}

/**
 * Segmentează seria de presiuni a punctelor active.
 */
export function segmentPressureCurve(active: WorkingPoint[]): SegmentationResult {
  if (active.length < 2) {
    return {
      phases: [],
      loops: [],
      suggestedProgramme: null,
      suggestionNote: "Prea puține puncte pentru segmentare.",
    };
  }

  // Direcții pe fiecare pas
  const dirs: Array<"up" | "down" | "flat"> = [];
  for (let i = 1; i < active.length; i++) {
    dirs.push(directionOf(active[i].pressureKPa - active[i - 1].pressureKPa));
  }

  // Segmente brute pe direcție dominantă (flat seata pe direcția curentă)
  type RawSeg = { start: number; end: number; dir: "up" | "down" | "flat" };
  const raw: RawSeg[] = [];
  let segStart = 0;
  let curDir = dirs[0] ?? "flat";

  for (let i = 0; i < dirs.length; i++) {
    const d = dirs[i];
    const effective = d === "flat" ? curDir : d;
    if (d !== "flat" && d !== curDir && curDir !== "flat") {
      raw.push({ start: segStart, end: i, dir: curDir });
      segStart = i;
      curDir = d;
    } else if (d !== "flat") {
      curDir = d;
    } else {
      // flat: verifică hold lung
      void effective;
    }
  }
  raw.push({ start: segStart, end: active.length - 1, dir: curDir === "flat" ? "up" : curDir });

  // Merge segmente scurte în vecini
  const merged: RawSeg[] = [];
  for (const s of raw) {
    const n = s.end - s.start + 1;
    if (merged.length && n < MIN_PHASE_POINTS) {
      merged[merged.length - 1].end = s.end;
    } else if (
      merged.length &&
      merged[merged.length - 1].dir === s.dir
    ) {
      merged[merged.length - 1].end = s.end;
    } else {
      merged.push({ ...s });
    }
  }

  // Detectează hold: Δp mic pe ≥3 puncte
  const refined: RawSeg[] = [];
  for (const s of merged) {
    const p0 = active[s.start].pressureKPa;
    const p1 = active[s.end].pressureKPa;
    const span = Math.abs(p1 - p0);
    const n = s.end - s.start + 1;
    if (n >= 3 && span <= HOLD_MAX_DP_KPA) {
      refined.push({ start: s.start, end: s.end, dir: "flat" });
    } else {
      refined.push(s);
    }
  }

  let sawUnload = false;
  const phases: CurvePhase[] = refined.map((s, i) => {
    let kind: PhaseKind;
    if (s.dir === "flat") kind = "hold";
    else if (s.dir === "down") {
      kind = "unloading";
      sawUnload = true;
    } else {
      // up
      kind = sawUnload ? "reloading" : "loading";
    }
    const slice = active.slice(s.start, s.end + 1);
    return {
      id: `ph-${i}`,
      kind,
      startIdx: s.start,
      endIdx: s.end,
      pointIndices: slice.map((p) => p.index),
      pStartKPa: active[s.start].pressureKPa,
      pEndKPa: active[s.end].pressureKPa,
      label: phaseLabel(kind, i),
      manual: false,
    };
  });

  // Ultima descărcare fără reload → final_unload
  const last = phases[phases.length - 1];
  if (last?.kind === "unloading") {
    last.kind = "final_unload";
    last.label = "Descărcare finală";
  }

  const loops = buildLoops(phases, active);
  const suggestion = suggestProgramme(phases, loops);

  return {
    phases,
    loops,
    suggestedProgramme: suggestion.programme,
    suggestionNote: suggestion.note,
  };
}

function phaseLabel(kind: PhaseKind, i: number): string {
  switch (kind) {
    case "loading":
      return i === 0 ? "Încărcare inițială" : `Încărcare #${i + 1}`;
    case "unloading":
      return `Descărcare`;
    case "reloading":
      return `Reîncărcare`;
    case "hold":
      return `Menținere`;
    case "final_unload":
      return `Descărcare finală`;
    default:
      return `Fază #${i + 1}`;
  }
}

function buildLoops(phases: CurvePhase[], active: WorkingPoint[]): CurveLoop[] {
  const loops: CurveLoop[] = [];
  let i = 0;
  let loopNo = 0;
  while (i < phases.length) {
    const ph = phases[i];
    if (ph.kind !== "unloading") {
      i++;
      continue;
    }
    const unload = ph;
    let j = i + 1;
    let hold: CurvePhase | null = null;
    if (phases[j]?.kind === "hold") {
      hold = phases[j];
      j++;
    }
    const reload = phases[j]?.kind === "reloading" ? phases[j] : null;
    loopNo++;
    const endIdx = reload ? reload.endIdx : unload.endIdx;
    const piKPa = Math.max(
      ...active.slice(Math.max(0, unload.startIdx - 1), unload.startIdx + 1).map((p) => p.pressureKPa),
      unload.pStartKPa
    );
    const p11KPa = Math.min(
      ...active.slice(unload.startIdx, (reload?.endIdx ?? unload.endIdx) + 1).map((p) => p.pressureKPa)
    );
    loops.push({
      id: `loop-${loopNo}`,
      index: loopNo,
      unloadPhaseId: unload.id,
      reloadPhaseId: reload?.id ?? null,
      holdPhaseId: hold?.id ?? null,
      piKPa,
      p11KPa,
      startIdx: unload.startIdx,
      endIdx,
      complete: reload != null,
      label: `Buclă ${loopNo}`,
    });
    // Relabel phases
    unload.label = `Descărcare U${loopNo}`;
    if (reload) reload.label = `Reîncărcare R${loopNo}`;
    if (hold) hold.label = `Menținere H${loopNo}`;
    i = reload ? j + 1 : i + 1;
  }
  return loops;
}

function suggestProgramme(
  phases: CurvePhase[],
  loops: CurveLoop[]
): { programme: SegmentationResult["suggestedProgramme"]; note: string } {
  const holds = phases.filter((p) => p.kind === "hold");
  const complete = loops.filter((l) => l.complete);
  const hasFinal = phases.some((p) => p.kind === "final_unload");

  if (holds.length >= 1 && complete.length === 0) {
    return {
      programme: "C",
      note: "Sugestie: menținere detectată, fără bucle complete — posibil program C. Confirmare utilizator necesară.",
    };
  }
  if (complete.length >= 3) {
    return {
      programme: "B",
      note: `Sugestie: ${complete.length} bucle complete — tipic program B (≥3 bucle parțiale). Confirmare utilizator necesară.`,
    };
  }
  if (complete.length >= 2 && hasFinal) {
    return {
      programme: "A",
      note: `Sugestie: ${complete.length} bucle + descărcare finală — tipic program A. Confirmare utilizator necesară.`,
    };
  }
  if (complete.length >= 2) {
    return {
      programme: "A",
      note: `Sugestie: ${complete.length} bucle — posibil program A (verificați descărcarea finală). Confirmare utilizator necesară.`,
    };
  }
  if (complete.length >= 1) {
    return {
      programme: "custom",
      note: `Sugestie: ${complete.length} buclă/bucle — insuficient pentru A (≥2) sau B (≥3) fără confirmare.`,
    };
  }
  return {
    programme: null,
    note: "Nu s-a putut sugera un program de referință din forma curbei.",
  };
}

/** Interval 30–70% pe un domeniu de presiune [pLow, pHigh] → filtrează puncte pe descărcare/reîncărcare */
export function selectPercentPressureBand(
  points: WorkingPoint[],
  pLowKPa: number,
  pHighKPa: number,
  loFrac = 0.3,
  hiFrac = 0.7
): { indices: number[]; pLo: number; pHi: number } {
  const span = pHighKPa - pLowKPa;
  if (!(span > 0) || points.length === 0) {
    return { indices: [], pLo: pLowKPa, pHi: pHighKPa };
  }
  const pLo = pLowKPa + loFrac * span;
  const pHi = pLowKPa + hiFrac * span;
  const indices: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i].pressureKPa;
    if (p >= pLo && p <= pHi) indices.push(i);
  }
  return { indices, pLo, pHi };
}

/** Parsează Pass time hh:mm:ss → minute de la start (sau null) */
export function passTimeToMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const m = /^(\d+):(\d{2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const s = Number(m[3]);
  if (![h, min, s].every(Number.isFinite)) return null;
  return h * 60 + min + s / 60;
}
