/**
 * Parametri derivați din modulul de forfecare GPBP (G) și ν.
 *
 * Kᵣ = 2G/rs  (echivalent Δp/Δr pe aceleași puncte; nu e Kb)
 * EPBP (E) = 2G(1+ν)
 * Kb = E / [3(1−2ν)]
 * E_plane_strain = E / (1−ν²)
 * M = E(1−ν) / [(1+ν)(1−2ν)]
 * mv = 1/M
 * λ = Eν / [(1+ν)(1−2ν)]
 *
 * Opțional (convenție program vechi, nu ISO):
 * k_W = E / [rs × (1 − ν²)]  cu rs în metri → kN/m³
 */

import type { ComputedResult } from "@/lib/schema/pmt-v1";

export type DerivedFromGpbpInput = {
  sourceKey: string;
  /** Modul de forfecare GPBP [MPa] */
  G: number;
  /** Coeficient Poisson */
  nu: number;
  /** Rază la presiunea de așezare [mm] — pentru Kᵣ */
  rsMm: number | null;
  usedActiveIndices?: number[];
  phaseLabel?: string | null;
};

function push(
  out: ComputedResult[],
  partial: Omit<ComputedResult, "origin"> & { origin?: ComputedResult["origin"] }
) {
  out.push({
    origin: "calculated",
    ...partial,
  });
}

/** Parsează rs din șirul variables al rezultatului GPBP (Formula 5). */
export function parseRsMmFromVariables(variables: string | null | undefined): number | null {
  if (!variables) return null;
  const m = /rs\s*=\s*([\d.+-eE]+)\s*mm/i.exec(variables);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function isGpbpSourceKey(key: string): boolean {
  return /^(GL1|GU_final|GU\d+|GR\d+|GUR\d+|G_manual)$/.test(key);
}

/**
 * Calculează familia de parametri derivați pentru un modul GPBP.
 * Returnează [] dacă G sau ν sunt invalide.
 */
export function derivedParamsFromGpbp(
  input: DerivedFromGpbpInput
): ComputedResult[] {
  const { sourceKey, G, nu, rsMm } = input;
  if (!Number.isFinite(G) || !Number.isFinite(nu)) return [];
  if (nu <= -1 || nu >= 0.5) {
    // (1−2ν) ≤ 0 → Kb, M, λ nedefinite pentru elasticitate izotropă tipică
    // totuși EPBP și E_plane_strain pot exista dacă ν < 1
  }

  const out: ComputedResult[] = [];
  const base = {
    usedActiveIndices: input.usedActiveIndices,
    phaseLabel: input.phaseLabel ?? null,
    reference: "Relații elasticitate izotropă liniară (derivate din GPBP și ν)",
  };

  // Kᵣ = 2G/rs  [MPa/mm] când rs în mm — echivalent Δp/Δr
  if (rsMm != null && rsMm > 0) {
    const Kr = (2 * G) / rsMm;
    push(out, {
      ...base,
      key: `Kr_${sourceKey}`,
      label: `Kᵣ(${sourceKey}) — rigiditate radială`,
      value: Kr,
      unit: "MPa/mm",
      formula: `Kᵣ = 2 × ${sourceKey} / rs  (= Δp/Δr pe aceleași puncte)`,
      variables: `${sourceKey}=${G.toPrecision(4)} MPa; rs=${rsMm.toFixed(3)} mm`,
      note: "Nu confundați cu Kb (modul volumic).",
    });
  }

  // EPBP (E)
  const E = 2 * G * (1 + nu);
  push(out, {
    ...base,
    key: `EPBP_${sourceKey}`,
    label: `EPBP(${sourceKey}) — modulul lui Young`,
    value: E,
    unit: "MPa",
    formula: `EPBP = 2 × ${sourceKey} × (1 + ν)`,
    variables: `ν=${nu}; ${sourceKey}=${G.toPrecision(4)} MPa`,
    note: `Derivat din modulul de forfecare ${sourceKey}.`,
  });

  const oneMinusNuSq = 1 - nu * nu;
  if (oneMinusNuSq > 1e-12) {
    const Eps = E / oneMinusNuSq;
    push(out, {
      ...base,
      key: `E_plane_strain_${sourceKey}`,
      label: `E_plane_strain(${sourceKey}) — modul Young echivalent (deformație plană)`,
      value: Eps,
      unit: "MPa",
      formula: `E_plane_strain = E / (1 − ν²)`,
      variables: `E=EPBP(${sourceKey})=${E.toPrecision(4)} MPa; ν=${nu}`,
      note: null,
    });
  }

  const denomIso = (1 + nu) * (1 - 2 * nu);
  if (denomIso > 1e-12) {
    const Kb = E / (3 * (1 - 2 * nu));
    push(out, {
      ...base,
      key: `Kb_${sourceKey}`,
      label: `Kb(${sourceKey}) — modulul volumic`,
      value: Kb,
      unit: "MPa",
      formula: `Kb = E / [3(1 − 2ν)]`,
      variables: `E=EPBP(${sourceKey})=${E.toPrecision(4)} MPa; ν=${nu}`,
      note: "Relație pentru elasticitate izotropă liniară.",
    });

    const M = (E * (1 - nu)) / denomIso;
    push(out, {
      ...base,
      key: `M_${sourceKey}`,
      label: `M(${sourceKey}) — modul constrâns`,
      value: M,
      unit: "MPa",
      formula: `M = E(1 − ν) / [(1 + ν)(1 − 2ν)]`,
      variables: `E=EPBP(${sourceKey})=${E.toPrecision(4)} MPa; ν=${nu}`,
      note: "Parametru derivat (oedometric / constrained modulus).",
    });

    if (M > 1e-18) {
      push(out, {
        ...base,
        key: `mv_${sourceKey}`,
        label: `mv(${sourceKey}) — coeficient de compresibilitate volumică`,
        value: 1 / M,
        unit: "1/MPa",
        formula: `mv = 1 / M`,
        variables: `M=${M.toPrecision(4)} MPa`,
        note: null,
      });
    }

    const lambda = (E * nu) / denomIso;
    push(out, {
      ...base,
      key: `lambda_${sourceKey}`,
      label: `λ(${sourceKey}) — parametrul Lamé`,
      value: lambda,
      unit: "MPa",
      formula: `λ = Eν / [(1 + ν)(1 − 2ν)]`,
      variables: `E=EPBP(${sourceKey})=${E.toPrecision(4)} MPa; ν=${nu}`,
      note: "Parametru al modelului elastic izotrop.",
    });
  }

  return out;
}

/**
 * k_Winkler după convenția programului vechi:
 *   k_W = E / [rs × (1 − ν²)]
 * E [MPa], rs [mm] → conversie rs în metri; rezultat [kN/m³].
 *
 * 1 MPa/m = 10³ kN/m³, deci k[kN/m³] = 1000 × E_MPa / (rs_m × (1−ν²)).
 */
export function computeKWinklerKNm3(
  E_MPa: number,
  rsMm: number,
  nu: number
): number | null {
  if (!Number.isFinite(E_MPa) || E_MPa <= 0) return null;
  if (!Number.isFinite(rsMm) || rsMm <= 0) return null;
  if (!Number.isFinite(nu)) return null;
  const denom = 1 - nu * nu;
  if (denom <= 1e-12) return null;
  const rsM = rsMm / 1000;
  return (1000 * E_MPa) / (rsM * denom);
}

/**
 * Estimare Winkler din E(GL1), rs la ps și ν.
 * Nu este rezultat ISO 22476-5.
 */
export function kWinklerResultFromGL1(opts: {
  E_MPa: number;
  rsMm: number;
  nu: number;
  usedActiveIndices?: number[];
}): ComputedResult | null {
  const k = computeKWinklerKNm3(opts.E_MPa, opts.rsMm, opts.nu);
  if (k == null) return null;
  const rsM = opts.rsMm / 1000;
  return {
    key: "kWinkler_GL1",
    label: "Estimare Winkler derivată din GL1",
    value: k,
    unit: "kN/m³",
    origin: "calculated",
    formula: "k_W = E / [rs × (1 − ν²)]  (convenție program vechi)",
    variables: `E=${opts.E_MPa.toPrecision(4)} MPa (din GL1); rs=${opts.rsMm.toFixed(3)} mm = ${rsM.toFixed(5)} m; ν=${opts.nu}`,
    reference:
      "Convenție program vechi OYO/FlexiPMT — nu este definită de ISO 22476-5",
    note:
      "Estimare dependentă de model și de raza de referință la ps; nu e rezultat direct al încercării.",
    usedActiveIndices: opts.usedActiveIndices,
    phaseLabel: "Derivat GL1",
  };
}

/** Chei de parametri derivați (pentru filtrare UI / raport). */
export function isDerivedParamKey(key: string): boolean {
  return (
    /^(Kr|EPBP|Kb|E_plane_strain|M|mv|lambda)_/.test(key) ||
    key === "kWinkler_GL1"
  );
}
