/**
 * Câmpuri necesare în funcție de program / rezultat / bază de calcul.
 * Nu blochează modulul pentru câmpuri nefolosite (ν, celulă, limită practică).
 */

import type { PmtPayloadV1, RequiredInputs } from "@/lib/schema/pmt-v1";
import { defaultRequiredInputs } from "@/lib/schema/pmt-v1";

export type NeededField = {
  id: string;
  label: string;
  reason: string;
  satisfied: boolean;
  /** Dacă true, lipsa blochează calculul rezultatului selectat */
  blocksCalculation: boolean;
};

function riOf(payload: PmtPayloadV1): RequiredInputs {
  return { ...defaultRequiredInputs(), ...(payload.requiredInputs ?? {}) };
}

export function hasManualPs(payload: PmtPayloadV1): boolean {
  const ri = riOf(payload);
  return (
    ri.psCsvPointNumber != null ||
    (ri.psManualKPa != null && Number.isFinite(ri.psManualKPa))
  );
}

export function usesVolumetricBasis(payload: PmtPayloadV1): boolean {
  return payload.programmeState?.measurementBasis === "injected_volume";
}

export function wantsEpbp(payload: PmtPayloadV1): boolean {
  return Boolean(riOf(payload).computeEpbp);
}

export function programmeNeedsPs(payload: PmtPayloadV1): boolean {
  const prog =
    payload.programmeState?.programme ??
    payload.interpretation?.programme ??
    "none";
  if (!prog || prog === "none") return false;
  // Modulele GPBP (Formula 5/6) folosesc rs la ps; kf nu obligatoriu, dar programul C tot folosește δ
  return true;
}

export function hasSavedModulusSelections(payload: PmtPayloadV1): boolean {
  return (payload.programmeState?.fitOverrides?.length ?? 0) > 0;
}

/**
 * Listă dinamică pentru UI: ce lipsește / ce e necesar pentru rezultatele alese.
 */
export function fieldsNeededForSelectedResults(
  payload: PmtPayloadV1
): NeededField[] {
  const ri = riOf(payload);
  const fields: NeededField[] = [];
  const prog =
    payload.programmeState?.programme ??
    payload.interpretation?.programme ??
    "none";
  const target = payload.programmeState?.selectionTargetKey;
  const vol = usesVolumetricBasis(payload);
  const epbp = wantsEpbp(payload);
  const needPs = programmeNeedsPs(payload);

  if (!prog || prog === "none") {
    fields.push({
      id: "programme",
      label: "Program de încărcare",
      reason: "Selectați A/B/C/D în panoul Interpretare pe program",
      satisfied: false,
      blocksCalculation: true,
    });
  } else if (
    payload.programmeState &&
    !payload.programmeState.programmeConfirmed
  ) {
    fields.push({
      id: "programmeConfirm",
      label: "Confirmare program",
      reason: "Confirmați programul selectat",
      satisfied: false,
      blocksCalculation: true,
    });
  }

  if (needPs) {
    const ok = hasManualPs(payload);
    const blocked = target
      ? `${target} (și celelalte module GPBP)`
      : "GL1 / GUi / GRi / GURi (rs la ps)";
    fields.push({
      id: "ps",
      label: "ps — punct de așezare pe grafic",
      reason: ok
        ? ri.psCsvPointNumber != null
          ? `CSV #${ri.psCsvPointNumber} · ${ri.psManualKPa?.toFixed(1) ?? "?"} kPa`
          : `manual ${ri.psManualKPa?.toFixed(1)} kPa`
        : `Selectați pe grafic („Selectează punct ps”). Fără ps: ${blocked} nu pot folosi rs la așezare.`,
      satisfied: ok,
      blocksCalculation: true,
    });
  }

  if (!hasSavedModulusSelections(payload) && prog && prog !== "none") {
    fields.push({
      id: "selection",
      label: "Selecție puncte pe grafic",
      reason: target
        ? `Selectați intervalul pentru ${target} (Number CSV = intervalul de fit)`
        : "Alegeți rezultatul, apoi selectați punctele pe grafic",
      satisfied: false,
      blocksCalculation: true,
    });
  }

  if (vol) {
    const hasLen = ri.cellLengthM != null && ri.cellLengthM > 0;
    fields.push({
      id: "cellLength",
      label: "Lungime celulă activă [m]",
      reason: "Necesară pentru Formula (6) / Vs",
      satisfied: hasLen && ri.cellLengthConfirmed,
      blocksCalculation: true,
    });
  }

  if (epbp) {
    fields.push({
      id: "poisson",
      label: "ν (Poisson)",
      reason: "Necesar pentru EPBP = 2×GPBP×(1+ν)",
      satisfied: ri.poisson != null && Number.isFinite(ri.poisson),
      blocksCalculation: true,
    });
  }

  return fields;
}

/** Goluri care blochează calculul rezultatelor selectate (nu limita practică / operator). */
export function calculationBlockingFields(
  payload: PmtPayloadV1
): NeededField[] {
  return fieldsNeededForSelectedResults(payload).filter(
    (f) => f.blocksCalculation && !f.satisfied
  );
}
