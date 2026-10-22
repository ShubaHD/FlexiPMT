"use client";

import type { PmtPayloadV1 } from "@/lib/schema/pmt-v1";
import { defaultRequiredInputs } from "@/lib/schema/pmt-v1";
import { resultKeyLabel } from "@/lib/calc/programme-moduli";
import {
  derivedParameterResults,
  programmeModulusResults,
} from "@/lib/report/report-content";

type Props = {
  payload: PmtPayloadV1;
  pending?: boolean;
  onChange: (next: PmtPayloadV1) => void;
  onCompute: () => void;
  onPersist?: (next: PmtPayloadV1) => void;
};

export function DerivedParamsPanel({
  payload,
  pending,
  onChange,
  onCompute,
  onPersist,
}: Props) {
  const ri = {
    ...defaultRequiredInputs(),
    ...(payload.requiredInputs ?? {}),
  };
  const moduli = programmeModulusResults(payload.results ?? []).filter(
    (r) => r.key !== "kf" && r.value != null
  );
  const derived = derivedParameterResults(payload.results ?? []);
  const selected = new Set(ri.derivedSourceKeys ?? []);
  const hasGl1 = moduli.some((m) => m.key === "GL1");
  const canCompute =
    ri.poisson != null &&
    ((selected.size > 0 && moduli.length > 0) ||
      (ri.computeKWinkler && hasGl1));

  function patchRi(
    partial: Partial<typeof ri>,
    opts?: { persist?: boolean }
  ) {
    const nextRi = { ...ri, ...partial };
    const next = {
      ...payload,
      requiredInputs: nextRi,
      calibration: {
        ...payload.calibration,
        poisson: nextRi.poisson ?? payload.calibration.poisson,
      },
    };
    onChange(next);
    if (opts?.persist) onPersist?.(next);
  }

  function toggleSource(key: string) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    patchRi({ derivedSourceKeys: [...next] });
  }

  function setPoisson(raw: string) {
    const v = raw === "" ? null : Number(raw.replace(",", "."));
    patchRi({
      poisson: Number.isFinite(v as number) || v === null ? v : ri.poisson,
    });
  }

  return (
    <div className="card space-y-3 no-print">
      <div>
        <h2 className="font-medium">Parametri derivați</h2>
        <p className="mt-0.5 text-xs text-muted">
          Alegeți baza GPBP (GL1, GUR1, …), introduceți ν, calculați. În raport
          apar doar dacă bifați „Include în raport”. Formule:{" "}
          <strong>Kᵣ</strong> = 2G/rs; <strong>EPBP</strong> = 2G(1+ν);{" "}
          <strong>Kb</strong>, <strong>E_plane_strain</strong>, <strong>M</strong>,{" "}
          <strong>mv</strong>, <strong>λ</strong> din E și ν.
        </p>
      </div>

      <div>
        <div className="mb-1 text-sm font-medium">Bază de calcul (GPBP)</div>
        {moduli.length === 0 ? (
          <p className="text-xs text-[var(--warn)]">
            Mai întâi calculați modulele GPBP (selecții pe program).
          </p>
        ) : (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {moduli.map((m) => (
              <label
                key={m.key}
                className="flex items-center gap-1.5 text-sm"
              >
                <input
                  type="checkbox"
                  checked={selected.has(m.key)}
                  onChange={() => toggleSource(m.key)}
                />
                <span>
                  {m.key}
                  {m.value != null
                    ? ` (${Number(m.value).toPrecision(3)} MPa)`
                    : ""}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="field min-w-[10rem]">
          <label htmlFor="derived-nu">Coeficient Poisson ν</label>
          <input
            id="derived-nu"
            type="number"
            step="any"
            placeholder="ex. 0.3"
            value={ri.poisson ?? ""}
            onChange={(e) => setPoisson(e.target.value)}
          />
          <span className="text-[0.7rem] text-muted">
            Tipic 0.25–0.45. Necesar pentru EPBP, Kb, M, mv, λ.
          </span>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending || !canCompute}
          onClick={onCompute}
        >
          {derived.length > 0
            ? "Recalculează parametri derivați"
            : "Calculează parametri derivați"}
        </button>
        {selected.size === 0 && moduli.length > 0 && (
          <p className="text-xs text-[var(--warn)]">
            Bifați cel puțin o bază (GL1 / GUR…).
          </p>
        )}
        {selected.size > 0 && ri.poisson == null && (
          <p className="text-xs text-[var(--warn)]">
            Introduceți ν, apoi calculați.
          </p>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={ri.computeKWinkler}
          onChange={(e) =>
            patchRi({ computeKWinkler: e.target.checked })
          }
        />
        Calculează k_Winkler din GL1 (opțional) —{" "}
        <span className="text-muted">
          k_W = E / [rs × (1 − ν²)], rs în m → kN/m³; convenție program vechi,
          nu ISO
        </span>
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={ri.includeDerivedInReport}
          disabled={derived.length === 0}
          onChange={(e) =>
            patchRi(
              { includeDerivedInReport: e.target.checked },
              { persist: true }
            )
          }
        />
        Include parametrii derivați în raport
        {derived.length === 0 ? (
          <span className="text-xs text-muted">
            (disponibil după calcul)
          </span>
        ) : null}
      </label>

      {derived.length === 0 ? (
        <p className="text-sm text-muted">
          Niciun parametru derivat încă. După calcul apar aici Kᵣ, EPBP, Kb,
          E_plane_strain, M, mv și λ — cu denumire și formulă.
        </p>
      ) : (
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-panel">
              <tr className="border-b border-line text-muted">
                <th className="py-1 pr-2">Parametru</th>
                <th className="py-1 pr-2">Valoare</th>
                <th className="py-1 pr-2">Formulă aplicată</th>
              </tr>
            </thead>
            <tbody>
              {derived.map((r) => (
                <tr key={r.key} className="border-b border-line/60">
                  <td className="py-1.5 pr-2">{resultKeyLabel(r.key)}</td>
                  <td className="py-1.5 pr-2 font-medium whitespace-nowrap">
                    {r.value == null
                      ? "—"
                      : `${Number(r.value).toPrecision(4)} ${r.unit}`}
                  </td>
                  <td className="py-1.5 text-xs text-muted">
                    {r.formula ?? "—"}
                    {r.variables ? <div>{r.variables}</div> : null}
                    {r.note ? <div>{r.note}</div> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
