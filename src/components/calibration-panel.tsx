"use client";

import { useState } from "react";
import type { PmtPayloadV1 } from "@/lib/schema/pmt-v1";

type Props = {
  testId: string;
  payload: PmtPayloadV1;
  onUpdated: (payload: PmtPayloadV1, warnings: string[]) => void;
};

export function CalibrationPanel({ testId, payload, onUpdated }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onFile(file: File) {
    setBusy(true);
    setErr(null);
    try {
      const text = await file.text();
      const res = await fetch(`/api/tests/${testId}/calibration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Eroare");
      onUpdated(data.payload, data.warnings ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Eroare");
    } finally {
      setBusy(false);
    }
  }

  const tf = payload.testFactors ?? payload.elastMeta?.factors;
  const assocs = payload.associatedCalibrations ?? [];

  return (
    <details className="card space-y-3 no-print">
      <summary className="cursor-pointer font-medium">
        Calibrare KP/GA (trasabilitate — fără reaplicare)
        {assocs.length > 0 ? ` · ${assocs.length} document(e)` : ""}
      </summary>
      <p className="text-xs text-muted">
        Fișierele KP/GA și factorii din antet sunt doar referință. Elast Logger a
        aplicat calibrarea la export. FlexiPMT <strong>nu</strong> reaplică A(1),
        A(2), G, dRi(A) sau KP/GA pe Pressure / dRi / R.
      </p>

      {tf && (
        <div className="text-sm">
          <div className="font-medium">Factori din CSV (informativ)</div>
          <ul className="text-muted">
            <li>A(1) — factor presiune (pantă): {tf.factorA1 ?? "—"}</li>
            <li>A(2) — factor presiune (offset): {tf.factorA2 ?? "—"}</li>
            <li>G — gain rază (R): {tf.factorG ?? "—"}</li>
            <li>dRi(A) — factor deplasare radială: {tf.factorDriA ?? "—"}</li>
          </ul>
        </div>
      )}

      <div className="field">
        <label>Atașează KP.CSV / GA.CSV (document, fără efect pe calcul)</label>
        <input
          type="file"
          accept=".csv,.org,.CSV,.ORG"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
        />
      </div>
      {err && <p className="text-sm text-[var(--danger)]">{err}</p>}

      {assocs.length === 0 && (
        <p className="text-sm text-muted">Niciun document de calibrare atașat.</p>
      )}
      {assocs.map((a, i) => (
        <div key={i} className="rounded border border-line p-2 text-sm">
          <div className="font-medium">
            {a.file.kind} — {a.file.fileName}{" "}
            <span className="text-xs text-muted">(document)</span>
          </div>
          <div className="text-muted">
            {a.file.headerLabel || "—"} · țeavă {a.file.pipeDiameterMm ?? "?"} mm ·
            tub {a.file.tubeType ?? "?"} · data {a.file.date ?? "?"}{" "}
            {a.file.time ?? ""}
          </div>
          <div className="text-muted">
            Factori din document: A(1)={a.file.factors.factorA1 ?? "—"}, A(2)=
            {a.file.factors.factorA2 ?? "—"}, G={a.file.factors.factorG ?? "—"},
            dRi(A)={a.file.factors.factorDriA ?? "—"}
          </div>
          {a.factorDiffWarnings.length > 0 && (
            <ul className="mt-1 list-inside list-disc text-muted">
              {a.factorDiffWarnings.map((w, j) => (
                <li key={j}>{w} (doar informativ)</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </details>
  );
}
