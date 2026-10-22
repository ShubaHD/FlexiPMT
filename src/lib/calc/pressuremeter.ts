/**
 * Calcule presiometrice — modul separat de UI.
 *
 * SR EN ISO 22476-5:2023:
 * - Formula (5) GPBP pe deplasare radială; Formula (6) pe volum; Formula (7) kf
 * - Programe A/B/C/D: §6.4.2–6.4.4
 * - pe / δe / ΔVe (Anexa A): stare neverificată implicit — nu se aplică KP/GA
 *
 * IMPORTANT:
 * - pMax = max(P_active); NU este pL / rupere automată.
 * - Nu se reaplică Factor A/G/dRi sau Kp/Ga pe Pressure/dRi/R exportate de Elast Logger.
 */

import type {
  Calibration,
  ComputedResult,
  Interpretation,
  PmtPayloadV1,
  RequiredInputs,
  WorkingPoint,
} from "@/lib/schema/pmt-v1";
import {
  activePoints,
  defaultRequiredInputs,
  deriveReportStatus,
  missingRequiredFields,
} from "@/lib/schema/pmt-v1";
import { cavityVolumeCm3 as cavityVol } from "@/lib/calc/iso-formulae";
import {
  derivedParamsFromGpbp,
  isGpbpSourceKey,
  kWinklerResultFromGL1,
  parseRsMmFromVariables,
} from "@/lib/calc/derived-params";
import {
  rsAtPs,
  runProgrammeCalculations,
  type ProgrammeState,
} from "@/lib/calc/programme-moduli";
import { defaultProgrammeState } from "@/lib/calc/programme-types";

/** Lungime celulă / packer (m) — convenție OYO-App; utilizatorul trebuie să o confirme. */
export const CELL_LENGTH_M = 0.6;

export type CalcInput = {
  points: WorkingPoint[];
  calibration: Calibration;
  interpretation: Interpretation;
  requiredInputs?: RequiredInputs | null;
  programmeState?: ProgrammeState | null;
  correctionsStatus?: PmtPayloadV1["correctionsStatus"];
  correctionsStatusNote?: string | null;
  markProvisional?: boolean;
};

export type CalcOutput = {
  interpretation: Interpretation;
  results: ComputedResult[];
  warnings: string[];
  missingRequired: string[];
  reportStatus: ReturnType<typeof deriveReportStatus>;
  programmeState: ProgrammeState;
};

function linRegSlope(xs: number[], ys: number[]): number | null {
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

/** Volum cavitate la raza rs (mm) → cm³ */
export function cavityVolumeCm3(radiusMm: number, cellLengthM = CELL_LENGTH_M): number {
  return cavityVol(radiusMm, cellLengthM);
}

/**
 * Estimare automată ps — NU e măsurătoare.
 * Heuristici din OYO: R≥38 mm sau 0.15×pMax. Necesită acceptare explicită.
 */
export function estimatePsKPa(
  points: WorkingPoint[],
  pMaxKPa: number | null
): { value: number | null; note: string } {
  const active = activePoints(points);
  if (active.length === 0) return { value: null, note: "Fără puncte active." };

  const at38 = active.find((p) => (p.radiusMm ?? 0) >= 38);
  if (at38) {
    return {
      value: at38.pressureKPa,
      note: "Estimare: prima presiune cu R ≥ 38 mm (verificare tehnică necesară).",
    };
  }
  if (pMaxKPa && pMaxKPa > 0) {
    const thr = 0.15 * pMaxKPa;
    const hit = active.find((p) => p.pressureKPa > thr);
    if (hit) {
      return {
        value: hit.pressureKPa,
        note: "Estimare euristică 0.15×pMax (din OYO vechi) — verificare tehnică necesară.",
      };
    }
  }
  const positive = active.filter((p) => p.pressureKPa > 0);
  if (positive.length) {
    return {
      value: Math.min(...positive.map((p) => p.pressureKPa)),
      note: "Fallback: minimul presiunilor > 0 — verificare tehnică necesară.",
    };
  }
  return { value: null, note: "ps nu a putut fi estimat." };
}

/**
 * GPBP din volum — ISO 22476-5:2023 Formula (6):
 * GPBP = Vs × (Δp/ΔV)
 * Δp în MPa, ΔV și Vs în cm³ → GPBP în MPa.
 * Slope din regresia liniară p(MPa) vs ΔV pe intervalul [startIdx, endIdx] (indici pe lista activă).
 */
export function computeGpbpFromVolume(
  points: WorkingPoint[],
  startIdx: number,
  endIdx: number,
  vsCm3: number
): number | null {
  const slice = points.slice(startIdx, endIdx + 1);
  if (slice.length < 2 || vsCm3 <= 0) return null;
  const vols = slice.map((p) => p.volumeCm3);
  const pressMPa = slice.map((p) => p.pressureKPa / 1000);
  const slope = linRegSlope(vols, pressMPa);
  if (slope === null) return null;
  return vsCm3 * slope;
}

export function runCalculations(input: CalcInput): CalcOutput {
  const warnings: string[] = [];
  const active = activePoints(input.points);
  const interp: Interpretation = { ...input.interpretation };
  const cal = { ...input.calibration };
  const ri = input.requiredInputs ?? defaultRequiredInputs();

  // Sync inputs utilizator → calibrare / interpretare (fără presupoziții pe câmpuri goale)
  if (ri.poisson != null) cal.poisson = ri.poisson;
  // apparatusLimitKPa = limita practică admisă a configurației (nu neapărat nominal 20 MPa)
  if (ri.apparatusLimitKPa != null) interp.apparatusLimitKPa = ri.apparatusLimitKPa;

  // ps din punct CSV ales pe grafic (prioritar) sau valoare manuală
  if (ri.psCsvPointNumber != null) {
    const seat = active.find((p) => p.index === ri.psCsvPointNumber);
    if (seat) {
      interp.psKPa = seat.pressureKPa;
      interp.psOrigin = "manual";
    }
  } else if (ri.psManualKPa != null) {
    interp.psKPa = ri.psManualKPa;
    interp.psOrigin = "manual";
  }
  if (ri.fitStartIdx != null) interp.fitStartIdx = ri.fitStartIdx;
  if (ri.fitEndIdx != null) interp.fitEndIdx = ri.fitEndIdx;

  const cellLengthM = ri.cellLengthM;
  if (cellLengthM != null && !ri.cellLengthConfirmed) {
    warnings.push(
      "Lungimea celulei active nu este confirmată — ΔV/Vs folosesc valoarea introdusă doar după confirmare pentru raport verificat."
    );
  }

  if (cal.correctionsAlreadyApplied) {
    warnings.push(
      "Factorii aparatului din export Elast nu se reaplică pe P, dRi, R. Starea corecțiilor ISO pe/δe/ΔVe este separată."
    );
  }

  const corr = input.correctionsStatus ?? "unverified";
  // Nu marca rezultatele „preliminare” doar pentru că FlexiPMT nu verifică
  // independent corecțiile Elast; nu afirma aplicarea fără dovezi explicite.
  if (corr === "not_applied") {
    warnings.push(
      "Corecții pe/δe/ΔVe: înregistrate ca neaplicate în FlexiPMT."
    );
  }

  const pMax =
    active.length > 0 ? Math.max(...active.map((p) => p.pressureKPa)) : null;
  interp.pMaxKPa = pMax;
  interp.pMaxOrigin = pMax !== null ? "calculated" : "unavailable";

  // ps doar din selecție manuală / punct CSV — fără estimare automată în fluxul principal
  if (interp.psOrigin !== "manual" || interp.psKPa == null) {
    interp.psKPa = null;
    interp.psOrigin = "unavailable";
    const prog = input.programmeState?.programme ?? "none";
    if (prog && prog !== "none") {
      warnings.push(
        "ps lipsește: selectați punctul de așezare pe grafic. Fără ps, modulele GPBP nu folosesc rs la așezare (calcul blocat pentru raport verificat)."
      );
    }
  }

  // Checkbox / flag: raportat la limita PRACTICĂ a configurației, nu la nominal 20 MPa
  if (
    interp.apparatusLimitKPa != null &&
    pMax != null &&
    pMax >= interp.apparatusLimitKPa * 0.98
  ) {
    if (interp.rupturePressureKPa == null) {
      interp.apparatusLimitReachedWithoutRupture = true;
      interp.apparatusLimitNote =
        interp.apparatusLimitNote ||
        `Limita practică admisă a configurației (${(interp.apparatusLimitKPa / 1000).toFixed(2)} MPa = ${interp.apparatusLimitKPa} kPa) atinsă; ruperea terenului nu a fost observată / consemnată.`;
      warnings.push(interp.apparatusLimitNote);
    }
  }

  if (
    interp.ruptureOrigin === "calculated" &&
    interp.rupturePressureKPa === pMax
  ) {
    interp.rupturePressureKPa = null;
    interp.ruptureOrigin = "unavailable";
    warnings.push(
      "Nu se raportează automat pMax ca presiune de rupere (corecție față de OYO vechi)."
    );
  }

  const draftPayload = {
    workingPoints: input.points,
    requiredInputs: ri,
    interpretation: interp,
    programmeState: input.programmeState ?? defaultProgrammeState(),
    results: [] as ComputedResult[],
    reportStatus: "draft" as const,
  } as unknown as PmtPayloadV1;
  const missingRequired = missingRequiredFields(draftPayload);
  const provisional = missingRequired.length > 0;
  if (provisional) {
    warnings.push(
      `Date incomplete pentru rezultat verificat: ${missingRequired.join("; ")}. Raportul rămâne ciornă/incomplet.`
    );
  }

  const results: ComputedResult[] = [];

  results.push({
    key: "pMax",
    label: "Presiune maximă atinsă (pMax)",
    value: pMax,
    unit: "kPa",
    origin: "calculated",
    formula: "pMax = max(p_i) pe punctele active",
    variables: "p_i [kPa] din Pressure[MPa]×1000 (export aparat)",
    reference: "Definiție operațională FlexiPMT — nu este pL ISO/Menard",
    note: interp.apparatusLimitReachedWithoutRupture
      ? "Posibil limită aparat, nu rupere"
      : null,
    dataInterval: `n_active=${active.length}`,
  });

  results.push({
    key: "ps",
    label: "Presiune de așezare (ps)",
    value: interp.psKPa,
    unit: "kPa",
    origin: interp.psOrigin,
    formula:
      interp.psOrigin === "manual"
        ? "ps introdus manual"
        : "estimare (R≥38 mm sau 0.15×pMax) — nu e măsurătoare ISO directă",
    variables: "p [kPa], R [mm]",
    reference: "ISO 22476-5:2023, 3.1.8 (definiție); metoda de detecție = euristică OYO",
  });

  results.push({
    key: "rupture",
    label: "Presiune de rupere (observată)",
    value: interp.rupturePressureKPa,
    unit: "kPa",
    origin: interp.ruptureOrigin,
    formula: "doar dacă e consemnată explicit de utilizator",
    note: interp.apparatusLimitReachedWithoutRupture
      ? "Indisponibilă — limita aparatului fără rupere observată"
      : null,
  });

  const nominalKPa = ri.nominalMaxPressureKPa;
  results.push({
    key: "nominalMaxPressure",
    label: "Presiune maximă nominală aparat/sondă",
    value: nominalKPa,
    unit: "kPa",
    origin: nominalKPa != null ? "manual" : "unavailable",
    note:
      nominalKPa != null
        ? `${(nominalKPa / 1000).toFixed(2)} MPa = ${nominalKPa.toLocaleString("ro-RO")} kPa`
        : "Tipic OYO Digital Sonde: 20 MPa = 20 000 kPa",
    formula: "1 MPa = 1000 kPa",
  });
  results.push({
    key: "apparatusLimit",
    label: "Limită practică admisă (configurație test)",
    value: interp.apparatusLimitKPa,
    unit: "kPa",
    origin: interp.apparatusLimitKPa != null ? "manual" : "unavailable",
    note: ri.practicalLimitConfirmed
      ? "Confirmată de operator (tabel OYO = orientativ)"
      : "Necesită confirmare operator — tabelul e indicație practică orientativă",
    formula:
      interp.apparatusLimitKPa != null
        ? `${(interp.apparatusLimitKPa / 1000).toFixed(3)} MPa = ${interp.apparatusLimitKPa} kPa`
        : null,
  });
  if (ri.psCsvPointNumber != null) {
    results.push({
      key: "psCsvPoint",
      label: "Punct CSV de așezare (ps)",
      value: ri.psCsvPointNumber,
      unit: "Number",
      origin: "manual",
      note: `ps = ${interp.psKPa?.toFixed(1) ?? "?"} kPa din punctul CSV #${ri.psCsvPointNumber}`,
    });
  }

  const useCell = cellLengthM != null && cellLengthM > 0 ? cellLengthM : CELL_LENGTH_M;
  if (cellLengthM == null) {
    warnings.push(
      `Lungimea celulei nu e confirmată — se folosește ${CELL_LENGTH_M} m (convenție OYO) doar ca previzualizare.`
    );
  }

  // Module pe program — DOAR din selecții manuale (fitOverrides)
  let progState: ProgrammeState = {
    ...(input.programmeState ?? defaultProgrammeState()),
  };
  if (progState.programme !== "none") {
    interp.programme = progState.programme as Interpretation["programme"];
  }

  const progOut = runProgrammeCalculations({
    active,
    psKPa: interp.psKPa,
    cellLengthM: useCell,
    state: progState,
    rsMmFallback: cal.radiusMm || 35,
  });
  warnings.push(...progOut.warnings);
  progState = progOut.state;
  results.push(...progOut.results);

  // Legacy GPBP pe interval global — doar dacă programul e none (previzualizare)
  if (progState.programme === "none") {
    let i0 = interp.fitStartIdx;
    let i1 = interp.fitEndIdx;
    const fitIsManual =
      i0 != null && i1 != null && i0 >= 0 && i1 > i0 && i1 < active.length;
    if (!fitIsManual) {
      const psIdx =
        interp.psKPa != null
          ? Math.max(0, active.findIndex((p) => p.pressureKPa >= interp.psKPa!))
          : 0;
      i0 = Math.min(psIdx + 1, Math.max(0, active.length - 3));
      i1 = Math.min(
        active.length - 1,
        Math.max(i0 + 2, Math.floor(active.length * 0.55))
      );
      warnings.push(
        "Program neselectat — GPBP de previzualizare pe interval estimat. Selectați programul A/B/C/D."
      );
    }
    const rsMm = active[i0!]?.radiusMm ?? cal.radiusMm ?? 35;
    const vs = cavityVolumeCm3(rsMm, useCell);
    const gpbp = computeGpbpFromVolume(active, i0!, i1!, vs);
    const nu = cal.poisson;
    const epbp = gpbp != null ? 2 * gpbp * (1 + nu) : null;
    results.push({
      key: "GPBP_preview",
      label: "GPBP previzualizare (fără program)",
      value: gpbp,
      unit: "MPa",
      origin: "calculated",
      formula: "GPBP = Vs × (Δp/ΔV)  [Formula (6) — previzualizare]",
      variables: `Vs=${vs.toFixed(3)} cm³; indici [${i0}:${i1}]`,
      reference: "ISO 22476-5:2023, 6.3 — selectați programul pentru rezultate adecvate",
      note: provisional
        ? "PROVIZORIU — selectați programul de încărcare."
        : "Previzualizare; nu înlocuiește GL1/GUi/…",
    });
    if (epbp != null && ri.computeEpbp && ri.poisson != null) {
      results.push({
        key: "EPBP_preview",
        label: "EPBP previzualizare",
        value: epbp,
        unit: "MPa",
        origin: "calculated",
        formula: "EPBP = 2 × GPBP × (1 + ν)",
        variables: `ν=${nu}`,
        reference: "derivare elastică din GPBP",
        note: "Previzualizare — EPBP cerut explicit",
      });
    }
  } else if (ri.computeEpbp) {
    // Parametri derivați: Kᵣ, EPBP, Kb, E_plane_strain, M, mv, λ — doar pe bazele bifate
    const sourceSet = new Set(
      (ri.derivedSourceKeys ?? []).filter((k) => isGpbpSourceKey(k))
    );
    const gpbpBases = results.filter(
      (r) =>
        r.value != null &&
        Number.isFinite(r.value) &&
        isGpbpSourceKey(r.key) &&
        (sourceSet.size === 0 ? false : sourceSet.has(r.key))
    );
    if (sourceSet.size === 0) {
      warnings.push(
        "Parametri derivați — bifați cel puțin o bază (GL1, GUR1, …)."
      );
    } else if (ri.poisson == null) {
      warnings.push(
        "Parametri derivați — introduceți ν (Poisson). Modulele GPBP nu depind de ν."
      );
    } else if (gpbpBases.length === 0) {
      warnings.push(
        "Parametri derivați — bazele bifate nu au încă modul GPBP calculat (selecție pe grafic)."
      );
    } else {
      if (ri.poisson >= 0.5) {
        warnings.push(
          `ν=${ri.poisson}: Kb, M, mv și λ nu sunt definite (1−2ν ≤ 0).`
        );
      }
      const rsFallback = rsAtPs(
        active,
        interp.psKPa,
        cal.radiusMm || 35
      );
      let missingRs = false;
      for (const g of gpbpBases) {
        const rsMm = parseRsMmFromVariables(g.variables) ?? rsFallback;
        if (parseRsMmFromVariables(g.variables) == null && !(rsFallback > 0)) {
          missingRs = true;
        }
        results.push(
          ...derivedParamsFromGpbp({
            sourceKey: g.key,
            G: g.value as number,
            nu: ri.poisson,
            rsMm: rsMm > 0 ? rsMm : null,
            usedActiveIndices: g.usedActiveIndices,
            phaseLabel: g.phaseLabel ?? null,
          })
        );
      }
      if (missingRs) {
        warnings.push(
          "Kᵣ omis pentru unele module: rs la așezare nu e disponibil."
        );
      }
    }
  }

  // k_Winkler opțional — doar din GL1 (convenție program vechi)
  if (ri.computeKWinkler) {
    const gl1 = results.find(
      (r) => r.key === "GL1" && r.value != null && Number.isFinite(r.value)
    );
    const epbpGl1 = results.find(
      (r) =>
        r.key === "EPBP_GL1" && r.value != null && Number.isFinite(r.value)
    );
    if (ri.poisson == null) {
      warnings.push("k_Winkler — introduceți ν (Poisson).");
    } else if (!gl1 && !epbpGl1) {
      warnings.push(
        "k_Winkler — lipsește GL1 (selectați intervalul pe grafic și calculați)."
      );
    } else {
      const rsMm =
        (gl1 ? parseRsMmFromVariables(gl1.variables) : null) ??
        rsAtPs(active, interp.psKPa, cal.radiusMm || 35);
      const E =
        epbpGl1?.value != null
          ? (epbpGl1.value as number)
          : 2 * (gl1!.value as number) * (1 + ri.poisson);
      const wink = kWinklerResultFromGL1({
        E_MPa: E,
        rsMm,
        nu: ri.poisson,
        usedActiveIndices: gl1?.usedActiveIndices ?? epbpGl1?.usedActiveIndices,
      });
      if (wink) results.push(wink);
      else
        warnings.push(
          "k_Winkler — nu s-a putut calcula (verificați E, rs la ps, ν)."
        );
    }
  }

  if (interp.apparatusLimitReachedWithoutRupture) {
    results.push({
      key: "limitFlag",
      label: "Situație limită aparat",
      value: 1,
      unit: "-",
      origin: "manual",
      note:
        interp.apparatusLimitNote ||
        "Limita aparatului atinsă; ruperea nu a fost observată",
    });
  }

  input.calibration.poisson = cal.poisson;

  const reportStatus = deriveReportStatus({
    ...draftPayload,
    interpretation: interp,
    results,
    programmeState: progState,
    correctionsStatus: corr,
    reportStatus: provisional ? "incomplete" : "draft",
  });

  return {
    interpretation: interp,
    results,
    warnings,
    missingRequired,
    reportStatus,
    programmeState: progState,
  };
}

export function validatePoints(points: WorkingPoint[]): string[] {
  const issues: string[] = [];
  const active = activePoints(points);
  if (active.length === 0) issues.push("Nu există puncte active.");
  for (const p of active) {
    if (!Number.isFinite(p.pressureKPa)) {
      issues.push(`Punct ${p.index}: presiune invalidă.`);
    }
    if (!Number.isFinite(p.volumeCm3)) {
      issues.push(`Punct ${p.index}: volum invalid.`);
    }
    if (p.pressureKPa < 0) {
      issues.push(`Punct ${p.index}: presiune negativă (suspect).`);
    }
  }
  return issues;
}
