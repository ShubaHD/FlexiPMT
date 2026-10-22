"use client";

import type { PmtPayloadV1, RequiredInputs } from "@/lib/schema/pmt-v1";
import {
  defaultRequiredInputs,
  missingRequiredFields,
} from "@/lib/schema/pmt-v1";
import {
  fieldsNeededForSelectedResults,
  usesVolumetricBasis,
} from "@/lib/calc/fields-needed";

type Props = {
  payload: PmtPayloadV1;
  onChange: (ri: RequiredInputs) => void;
};

export function RequiredInputsForm({ payload, onChange }: Props) {
  const ri = { ...defaultRequiredInputs(), ...(payload.requiredInputs ?? {}) };
  const needed = fieldsNeededForSelectedResults(payload);
  const blocking = needed.filter((f) => f.blocksCalculation && !f.satisfied);
  const reportGaps = missingRequiredFields(payload);
  const showCell = usesVolumetricBasis(payload);
  const target = payload.programmeState?.selectionTargetKey;
  const prog = payload.programmeState?.programme ?? "none";

  return (
    <div className="card space-y-3 no-print">
      <h2 className="font-medium">Necesar pentru rezultatul ales</h2>
      <p className="text-xs text-muted">
        Intervalul de fit = selecțiile pe grafic (Number CSV). Nu introduceți
        indici Fit start/end. Câmpurile apar doar dacă rezultatul/metoda le
        folosesc. ν (Poisson) se introduce în panoul{" "}
        <strong>Parametri derivați</strong>.
        {prog !== "none" && target ? (
          <>
            {" "}
            Țintă curentă: <strong>{target}</strong> (program {prog}).
          </>
        ) : prog !== "none" ? (
          <> Program {prog} — alegeți rezultatul în panoul Interpretare.</>
        ) : null}
      </p>

      {needed.length > 0 ? (
        <ul className="space-y-1 text-xs">
          {needed.map((f) => (
            <li
              key={f.id}
              className={
                f.satisfied
                  ? "text-[var(--ok)]"
                  : f.blocksCalculation
                    ? "text-[var(--warn)]"
                    : "text-muted"
              }
            >
              {f.satisfied ? "✓" : "○"} <strong>{f.label}</strong> — {f.reason}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted">
          Selectați programul și rezultatul pentru a vedea ce lipsește.
        </p>
      )}

      {blocking.length > 0 && (
        <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-[var(--warn)]">
          Blochează calculul / raportul verificat:{" "}
          {blocking.map((b) => b.label).join("; ")}
        </div>
      )}

      <div className="rounded border border-line bg-accent-soft/20 px-3 py-2 text-sm">
        <div className="font-medium">ps (așezare)</div>
        {ri.psCsvPointNumber != null && ri.psManualKPa != null ? (
          <p>
            CSV #<strong>{ri.psCsvPointNumber}</strong> ·{" "}
            <strong>{ri.psManualKPa.toFixed(1)} kPa</strong> (
            {(ri.psManualKPa / 1000).toFixed(3)} MPa)
          </p>
        ) : ri.psManualKPa != null ? (
          <p>
            Manual: <strong>{ri.psManualKPa.toFixed(1)} kPa</strong>
          </p>
        ) : (
          <p className="text-muted">
            Neselectat — folosiți „Selectează punct ps” pe grafic.
            {prog !== "none" &&
              " Fără ps, modulele GPBP nu au rs la așezare."}
          </p>
        )}
        {(ri.psCsvPointNumber != null || ri.psManualKPa != null) && (
          <button
            type="button"
            className="btn text-xs mt-1"
            onClick={() =>
              onChange({
                ...ri,
                psCsvPointNumber: null,
                psManualKPa: null,
                acceptAutoPs: false,
              })
            }
          >
            Șterge ps
          </button>
        )}
      </div>

      {showCell && (
        <div className="field max-w-sm">
          <label>Lungime celulă activă [m]</label>
          <input
            type="number"
            step="any"
            value={ri.cellLengthM ?? ""}
            onChange={(e) => {
              onChange({
                ...ri,
                cellLengthM:
                  e.target.value === ""
                    ? null
                    : Number(e.target.value.replace(",", ".")),
                cellLengthConfirmed: false,
              });
            }}
          />
          <span className="text-[0.7rem] text-muted">
            Formula (6) / Vs. Nu se deduce din lungimea totală a sondei.
          </span>
          <label className="mt-1 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={ri.cellLengthConfirmed}
              onChange={(e) =>
                onChange({ ...ri, cellLengthConfirmed: e.target.checked })
              }
            />
            Confirm lungimea pentru Vs/ΔV
          </label>
        </div>
      )}

      <div className="field">
        <label>Note (opțional)</label>
        <textarea
          rows={2}
          value={ri.notes ?? ""}
          onChange={(e) =>
            onChange({ ...ri, notes: e.target.value || null })
          }
        />
      </div>

      <p className="text-xs text-muted">
        Stare raport: <strong>{payload.reportStatus ?? "draft"}</strong>
        {reportGaps.length > 0
          ? ` · pentru verificat mai trebuie: ${reportGaps.slice(0, 3).join("; ")}${reportGaps.length > 3 ? "…" : ""}`
          : " · datele pentru rezultatele selectate sunt complete"}
      </p>
    </div>
  );
}
