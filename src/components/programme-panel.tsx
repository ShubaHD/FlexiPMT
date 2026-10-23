"use client";

import { useMemo, useState } from "react";
import type { PmtPayloadV1 } from "@/lib/schema/pmt-v1";
import { activePoints } from "@/lib/schema/pmt-v1";
import type {
  ControllingParameter,
  LoadingProgramme,
  ProgrammeState,
} from "@/lib/calc/programme-types";
import {
  availableResultKeys,
  clearManualSelections,
  resultKeyColor,
  resultKeyLabel,
} from "@/lib/calc/programme-moduli";
import { segmentPressureCurve } from "@/lib/calc/segment-curve";

type Props = {
  payload: PmtPayloadV1;
  onChange: (next: PmtPayloadV1) => void;
  /** Opțional — din test.author; nu se mai editează în UI */
  author?: string;
  reason?: string;
  onReasonChange?: (v: string) => void;
  /** Aplică pe draft-ul graficului indicii unei bucle complete (Program B) */
  onApplyLoopIndices?: (indices: number[]) => void;
};

const PROGRAMMES: { value: LoadingProgramme; label: string }[] = [
  { value: "A", label: "Program A" },
  { value: "B", label: "Program B" },
  { value: "C", label: "Program C" },
  { value: "D", label: "Program D" },
  { value: "custom", label: "Alt program / personalizat" },
  { value: "none", label: "Neselectat" },
];

export function ProgrammePanel({
  payload,
  onChange,
  author: authorProp,
  reason: reasonProp,
  onReasonChange,
  onApplyLoopIndices,
}: Props) {
  const ps = payload.programmeState!;
  const [reasonLocal, setReasonLocal] = useState("");
  const [loopPick, setLoopPick] = useState("");
  const author = authorProp ?? null;
  const reason = reasonProp ?? reasonLocal;
  const setReason = onReasonChange ?? setReasonLocal;
  const keys = availableResultKeys(ps.programme);
  const isElast = Boolean(payload.elastMeta);
  const active = useMemo(
    () => activePoints(payload.workingPoints),
    [payload.workingPoints]
  );
  const seg = useMemo(() => segmentPressureCurve(active), [active]);
  const completeLoops = seg.loops.filter((l) => l.complete);

  function patchState(partial: Partial<ProgrammeState>) {
    let programmeState = { ...ps, ...partial };
    // Elast: ΔV nu e măsurat — Formula (6) nu e permisă ca volum injectat real
    if (
      isElast &&
      programmeState.measurementBasis === "injected_volume"
    ) {
      programmeState = {
        ...programmeState,
        measurementBasis: "radial_displacement",
      };
    }
    onChange({
      ...payload,
      programmeState,
      interpretation: {
        ...payload.interpretation,
        programme:
          programmeState.programme === "none"
            ? "none"
            : (programmeState.programme as typeof payload.interpretation.programme),
      },
    });
  }

  function selectProgramme(value: LoadingProgramme) {
    if (value !== ps.programme && ps.fitOverrides.length > 0) {
      const ok = window.confirm(
        "Schimbarea programului păstrează selecțiile doar dacă cheile coincid. Continuați?"
      );
      if (!ok) return;
    }
    const nextKeys = availableResultKeys(value);
    const keySet = new Set(nextKeys);
    patchState({
      programme: value,
      programmeConfirmed: value !== "none",
      selectionTargetKey:
        ps.selectionTargetKey && nextKeys.includes(ps.selectionTargetKey)
          ? ps.selectionTargetKey
          : null,
      // Nu păstra GUR când treci pe A (și invers) — evită confuzia pe grafic
      fitOverrides: ps.fitOverrides.filter((o) => keySet.has(o.resultKey)),
    });
  }

  function clearAll() {
    onChange({
      ...payload,
      programmeState: clearManualSelections({
        ...ps,
        programme: ps.programme,
        programmeConfirmed: ps.programmeConfirmed,
        controllingParameter: ps.controllingParameter,
        measurementBasis: ps.measurementBasis,
        chartAxisMode: ps.chartAxisMode ?? "p_R",
        chartTickSettings: ps.chartTickSettings,
      }),
    });
  }

  function removeOverride(key: string) {
    patchState({
      fitOverrides: ps.fitOverrides.filter((o) => o.resultKey !== key),
    });
  }

  function saveReason(key: string) {
    patchState({
      fitOverrides: ps.fitOverrides.map((o) =>
        o.resultKey === key
          ? {
              ...o,
              reason: reason.trim() || o.reason,
              author: author?.trim() || o.author,
            }
          : o
      ),
    });
  }

  function applyCompleteLoop() {
    if (!loopPick) return;
    const loop = completeLoops.find((l) => l.id === loopPick);
    if (!loop) return;
    const indices: number[] = [];
    for (let i = loop.startIdx; i <= loop.endIdx; i++) indices.push(i);
    onApplyLoopIndices?.(indices);
    // Dacă există țintă GUR, pre-salvează ca draft prin callback; utilizatorul apasă Aplică pe grafic
  }

  const targetIsGur =
    ps.programme === "B" &&
    ps.selectionTargetKey != null &&
    /^GUR\d+$/.test(ps.selectionTargetKey);

  return (
    <div className="card w-full min-w-0 space-y-4">
      <h2 className="font-medium">Interpretare pe program (selecție manuală)</h2>
      <p className="text-xs text-muted">
        FlexiPMT <strong>nu</strong> atribuie automat puncte pentru GL1 / GUi / GRi /
        GURi / kf. Alegeți programul și rezultatul, apoi selectați zona pe grafic.
        Punctele neselectate rămân pe curbă, dar nu intră în calcul.
      </p>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <div className="field">
          <label>1. Program</label>
          <select
            value={ps.programme}
            onChange={(e) => selectProgramme(e.target.value as LoadingProgramme)}
          >
            {PROGRAMMES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>2. Rezultat de calculat</label>
          <select
            value={ps.selectionTargetKey ?? ""}
            disabled={keys.length === 0}
            onChange={(e) =>
              patchState({ selectionTargetKey: e.target.value || null })
            }
          >
            <option value="">— alegeți rezultatul —</option>
            {keys.map((k) => (
              <option key={k} value={k}>
                {resultKeyLabel(k)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Mărime controlată pe teren</label>
          <select
            value={ps.controllingParameter}
            onChange={(e) =>
              patchState({
                controllingParameter: e.target.value as ControllingParameter,
              })
            }
          >
            <option value="pressure">Presiune</option>
            <option value="radial_displacement">Deplasare radială</option>
            <option value="volume">Volum</option>
          </select>
          <p className="mt-1 text-[11px] text-muted">
            Alegeți mărimea pe care operatorul a controlat-o în timpul încercării.
            Aceasta nu este neapărat aceeași cu mărimea măsurată de senzor.
          </p>
        </div>
        <div className="field">
          <label>Mărimea folosită la calculul GPBP</label>
          <select
            value={
              isElast ? "radial_displacement" : ps.measurementBasis
            }
            disabled={isElast}
            onChange={(e) =>
              patchState({
                measurementBasis: e.target
                  .value as ProgrammeState["measurementBasis"],
              })
            }
          >
            <option value="radial_displacement">
              Formula (5) — deplasare radială δ (dRi)
            </option>
            <option value="injected_volume" disabled={isElast}>
              Formula (6) — volum injectat măsurat
            </option>
          </select>
          <p className="mt-1 text-[11px] text-muted">
            {isElast
              ? "Elast Logger exportă dRi și R, nu un volum injectat măsurat. ΔV din FlexiPMT e derivat din R — Formula (6) nu e disponibilă ca volum măsurat."
              : "Formula (5): δ radială. Formula (6): doar dacă aparatul măsoară efectiv volumul injectat."}
          </p>
        </div>
      </div>

      <ul className="list-inside list-disc text-xs text-muted">
        <li>
          <strong>Presiune:</strong> presiunea este modificată sau menținută; expansiunea
          sondei este măsurată.
        </li>
        <li>
          <strong>Deplasare radială:</strong> deplasarea radială este controlată.
        </li>
        <li>
          <strong>Volum:</strong> volumul injectat este controlat.
        </li>
      </ul>

      {targetIsGur && (
        <div className="rounded border border-line bg-accent-soft/30 p-3 space-y-2">
          <div className="text-sm font-medium">
            Selectează bucla completă (Program B — GURi)
          </div>
          <p className="text-xs text-muted">
            Alegeți explicit bucla; aplicația nu o selectează singură. Se încarcă
            toate punctele descărcare+reîncărcare pe draft — apoi „Aplică” pe grafic.
          </p>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="field min-w-[14rem]">
              <label>Buclă detectată (informativ)</label>
              <select
                value={loopPick}
                onChange={(e) => setLoopPick(e.target.value)}
              >
                <option value="">— alegeți bucla —</option>
                {completeLoops.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label} (indici {l.startIdx}–{l.endIdx}, n=
                    {l.endIdx - l.startIdx + 1})
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="btn btn-primary text-sm"
              disabled={!loopPick}
              onClick={applyCompleteLoop}
            >
              Selectează bucla completă
            </button>
          </div>
          {completeLoops.length === 0 && (
            <p className="text-xs text-[var(--warn)]">
              Nicio buclă completă detectată informativ — selectați punctele manual pe
              grafic.
            </p>
          )}
        </div>
      )}

      <div className="field max-w-xl">
        <label>
          Motiv (obligatoriu dacă selecția GUi/GRi iese din banda 30–70%)
        </label>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="ex. puncte pe zona liniară vizibilă; bandă restrânsă din cauza zgomotului"
        />
        <p className="mt-1 text-[11px] text-muted">
          Program A: selectați doar mijlocul ramurii (între liniile 30% și 70% pe
          grafic). Dacă includeți și vârfurile buclei, trebuie motiv — altfel
          „Aplică” este blocat.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn" onClick={clearAll}>
          Anulează toate selecțiile
        </button>
        {ps.selectionTargetKey && (
          <button
            type="button"
            className="btn"
            onClick={() => saveReason(ps.selectionTargetKey!)}
          >
            Salvează motiv pentru {ps.selectionTargetKey}
          </button>
        )}
      </div>

      <p className="text-sm text-muted">{ps.loopCompliance.message}</p>
      {ps.suggestionNote && (
        <p className="text-xs text-muted">{ps.suggestionNote}</p>
      )}

      <div>
        <h3 className="mb-1 text-sm font-medium">
          Rezultate din selecții ({ps.fitOverrides.length})
        </h3>
        {ps.fitOverrides.length === 0 ? (
          <p className="text-sm text-muted">
            Nicio selecție salvată. Folosiți „Selectează puncte” pe grafic, apoi
            „Aplică”.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {ps.fitOverrides.map((o, i) => {
              const r = payload.results.find((x) => x.key === o.resultKey);
              const n =
                o.csvPointNumbers?.length ?? o.activeIndices?.length ?? "—";
              return (
                <li
                  key={o.resultKey}
                  className="rounded border border-line p-2"
                  style={{ borderLeftWidth: 4, borderLeftColor: resultKeyColor(o.resultKey, i) }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong>{resultKeyLabel(o.resultKey)}</strong>
                    <button
                      type="button"
                      className="btn text-xs"
                      onClick={() => removeOverride(o.resultKey)}
                    >
                      Șterge selecția
                    </button>
                  </div>
                  <div className="text-muted">
                    n={n}
                    {o.csvPointNumbers && o.csvPointNumbers.length > 0 && (
                      <> · CSV Number=[{o.csvPointNumbers.join(", ")}]</>
                    )}
                    {o.outsideStandardBand ? " · ⚠ în afara 30–70%" : ""}
                    {o.loopPointsExcluded ? " · ⚠ subset buclă B" : ""}
                  </div>
                  {r && (
                    <div>
                      {r.value != null
                        ? `${r.label || resultKeyLabel(r.key)} = ${r.value.toPrecision(4)} ${r.unit}`
                        : "valoare n/a"}
                      {r.slope != null && (
                        <> · pantă={r.slope.toExponential(3)}</>
                      )}
                      <div className="text-xs text-muted">{r.formula}</div>
                    </div>
                  )}
                  {(o.author || o.at) && (
                    <div className="text-xs text-muted">
                      {o.author ?? "?"} · {o.at?.slice(0, 19) ?? ""}
                    </div>
                  )}
                  {o.reason && (
                    <div className="text-xs">Motiv: {o.reason}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        <div className="field">
          <label>Abateri față de programul planificat (teren)</label>
          <textarea
            rows={2}
            value={ps.programmeDeviations ?? ""}
            onChange={(e) =>
              patchState({ programmeDeviations: e.target.value || null })
            }
          />
        </div>
        <div className="field">
          <label>Motiv abateri teren</label>
          <textarea
            rows={2}
            value={ps.deviationReason ?? ""}
            onChange={(e) =>
              patchState({ deviationReason: e.target.value || null })
            }
          />
        </div>
      </div>
    </div>
  );
}
