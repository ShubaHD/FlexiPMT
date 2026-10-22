"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";

type Props = {
  boreholes: { id: string; label: string }[];
};

export function ImportClient({ boreholes }: Props) {
  const router = useRouter();
  const [boreholeId, setBoreholeId] = useState(boreholes[0]?.id ?? "");
  const [author, setAuthor] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewCols, setPreviewCols] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [previewName, setPreviewName] = useState("");
  const [mapPressure, setMapPressure] = useState("");
  const [mapVolume, setMapVolume] = useState("");
  const [mapRadius, setMapRadius] = useState("");
  const [mapTime, setMapTime] = useState("");
  const [pressureUnit, setPressureUnit] = useState<"kPa" | "MPa">("MPa");

  function push(line: string) {
    setLog((L) => [...L, line]);
  }

  async function importOyoJson(file: File) {
    setBusy(true);
    setError(null);
    setLog([]);
    try {
      const text = await file.text();
      const document = JSON.parse(text);
      push(`Citit ${file.name} (${document.rawPoints?.length ?? "?"} puncte în JSON)`);
      if (!boreholeId) throw new Error("Selectați un foraj.");
      const res = await fetch("/api/import/oyo-json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boreholeId, fileName: file.name, document, author }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import eșuat");
      push(`Import OK → test ${data.test.label} (${data.test.id})`);
      push(`Puncte: ${data.summary.pointsImported}`);
      push(
        `Corecții deja aplicate: ${data.summary.correctionsAlreadyApplied ? "da" : "nu"}`
      );
      for (const w of data.warnings ?? []) push(`Avertisment: ${w}`);
      for (const m of data.summary?.missingFields ?? []) push(`Lipsă: ${m}`);
      for (const u of data.summary?.unconvertedFields ?? []) push(`Nemigrat: ${u}`);
      router.push(`/tests/${data.test.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare");
    } finally {
      setBusy(false);
    }
  }

  const [elastPreview, setElastPreview] = useState<{
    fileName: string;
    text: string;
    data: Record<string, unknown>;
  } | null>(null);

  async function previewElastCsv(file: File) {
    setBusy(true);
    setError(null);
    setLog([]);
    try {
      const text = await file.text();
      push(`Citit ${file.name} (${text.length} caractere) — previzualizare`);
      const res = await fetch("/api/import/elast-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          text,
          previewOnly: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Previzualizare eșuată");
      setElastPreview({ fileName: file.name, text, data });
      push(
        `Puncte detectate: ${data.pointsDetected} (Data size=${(data.metadata as { dataSize?: number })?.dataSize ?? "?"})`
      );
      push(`Puncte valide (P+R): ${data.pointsValid}`);
      const meta = data.metadata as {
        holeNo?: string;
        depthM?: number;
        fileId?: string;
        testDate?: string;
        factors?: Record<string, number | null>;
      };
      push(
        `Meta: File ID=${meta.fileId}, Hole=${meta.holeNo}, Depth=${meta.depthM}, Date=${meta.testDate}`
      );
      if (meta.factors) {
        push(
          `Factori: A(1)=${meta.factors.factorA1}, A(2)=${meta.factors.factorA2}, G=${meta.factors.factorG}, dRi(A)=${meta.factors.factorDriA}`
        );
      }
      const first = data.firstReading as { pressureMPa?: number; radiusMm?: number } | null;
      const last = data.lastReading as { pressureMPa?: number; radiusMm?: number } | null;
      if (first)
        push(
          `Prima citire: P=${first.pressureMPa} MPa, R=${first.radiusMm} mm`
        );
      if (last)
        push(`Ultima citire: P=${last.pressureMPa} MPa, R=${last.radiusMm} mm`);
      for (const w of (data.summary as { warnings?: string[] })?.warnings ?? [])
        push(`Avertisment: ${w}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare");
    } finally {
      setBusy(false);
    }
  }

  async function confirmElastImport() {
    if (!elastPreview) return;
    setBusy(true);
    setError(null);
    try {
      if (!boreholeId) throw new Error("Selectați un foraj.");
      const res = await fetch("/api/import/elast-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boreholeId,
          fileName: elastPreview.fileName,
          text: elastPreview.text,
          author,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import eșuat");
      push(`Import confirmat → ${data.test.label}`);
      setElastPreview(null);
      router.push(`/tests/${data.test.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare");
    } finally {
      setBusy(false);
    }
  }

  async function loadPreview(file: File) {
    setError(null);
    setPreviewName(file.name);
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
    });
    const rows = json.map((r) => {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(r)) out[k] = String(v ?? "");
      return out;
    });
    const cols = rows[0] ? Object.keys(rows[0]) : [];
    setPreviewCols(cols);
    setPreviewRows(rows.slice(0, 500));
    setMapPressure(cols.find((c) => /pressure|presiune|p\[/i.test(c)) ?? cols[0] ?? "");
    setMapVolume(cols.find((c) => /volume|volum|Δv|dv/i.test(c)) ?? "");
    setMapRadius(cols.find((c) => /^r\[|radius|raza/i.test(c)) ?? "");
    setMapTime(cols.find((c) => /time|timp/i.test(c)) ?? "");
    push(`Previzualizare ${file.name}: ${rows.length} rânduri, ${cols.length} coloane`);
  }

  async function confirmMappedImport() {
    setBusy(true);
    setError(null);
    try {
      if (!boreholeId) throw new Error("Selectați un foraj.");
      if (!mapPressure) throw new Error("Mapați coloana de presiune.");
      const res = await fetch("/api/import/csv-mapped", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boreholeId,
          fileName: previewName,
          author,
          rows: previewRows,
          mapping: {
            pressure: mapPressure,
            volume: mapVolume || undefined,
            radius: mapRadius || undefined,
            time: mapTime || undefined,
            pressureUnit,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import eșuat");
      push(`Import mapat OK → ${data.test.label}`);
      router.push(`/tests/${data.test.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare");
    } finally {
      setBusy(false);
    }
  }

  const previewHead = useMemo(() => previewRows.slice(0, 5), [previewRows]);

  return (
    <div className="space-y-4">
      <div className="card grid gap-3 sm:grid-cols-2">
        <div className="field">
          <label>Foraj țintă *</label>
          <select
            value={boreholeId}
            onChange={(e) => setBoreholeId(e.target.value)}
            required
          >
            {boreholes.length === 0 && (
              <option value="">Creați mai întâi un foraj</option>
            )}
            {boreholes.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Autor import</label>
          <input value={author} onChange={(e) => setAuthor(e.target.value)} />
        </div>
      </div>

      <div className="card space-y-3">
        <h2 className="font-medium">1. JSON migrat din .oyo</h2>
        <p className="text-sm text-muted">
          Nu încărcați fișiere .oyo direct în browser (pickle nesigur). Pe un
          fișier de încredere rulați:
        </p>
        <pre className="overflow-auto rounded bg-[#1a2332] p-3 text-xs text-white">
{`python tools/oyo_migrate.py cale\\test.oyo --trusted
# → generează test.flexipmt.json`}
        </pre>
        <input
          type="file"
          accept=".json,.flexipmt.json"
          disabled={busy || !boreholeId}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importOyoJson(f);
          }}
        />
      </div>

      <div className="card space-y-3">
        <h2 className="font-medium">2. CSV Elast Logger 3 (brut)</h2>
        <p className="text-sm text-muted">
          Preferabil: deschideți forajul și importați acolo (sau pe pagina
          testului, înainte de Metadate). Aici rămâne varianta cu alegere
          foraj. Pressure/dRi/R rămân nemodificate; ΔV e calculat ulterior.
        </p>
        <input
          type="file"
          accept=".csv,.txt,.xls,.CSV.xls,.org,.ORG"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void previewElastCsv(f);
          }}
        />
        {elastPreview && (
          <div className="space-y-2 rounded border border-line p-3 text-sm">
            <div className="font-medium">
              Previzualizare: {elastPreview.fileName} —{" "}
              {String(elastPreview.data.pointsDetected)} puncte
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !boreholeId}
              onClick={() => void confirmElastImport()}
            >
              Confirmă importul în forajul selectat
            </button>
          </div>
        )}
      </div>

      <div className="card space-y-3">
        <h2 className="font-medium">3. CSV / XLSX cu mapare coloane</h2>
        <p className="text-sm text-muted">
          Previzualizare și mapare înainte de import. Fișierul original nu este
          modificat.
        </p>
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          disabled={busy || !boreholeId}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void loadPreview(f);
          }}
        />
        {previewCols.length > 0 && (
          <div className="space-y-3 border-t border-line pt-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="field">
                <label>Presiune *</label>
                <select value={mapPressure} onChange={(e) => setMapPressure(e.target.value)}>
                  {previewCols.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Unitate presiune</label>
                <select
                  value={pressureUnit}
                  onChange={(e) => setPressureUnit(e.target.value as "kPa" | "MPa")}
                >
                  <option value="MPa">MPa</option>
                  <option value="kPa">kPa</option>
                </select>
              </div>
              <div className="field">
                <label>Volum (opțional)</label>
                <select value={mapVolume} onChange={(e) => setMapVolume(e.target.value)}>
                  <option value="">—</option>
                  {previewCols.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Rază (opțional)</label>
                <select value={mapRadius} onChange={(e) => setMapRadius(e.target.value)}>
                  <option value="">—</option>
                  {previewCols.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Timp (opțional)</label>
                <select value={mapTime} onChange={(e) => setMapTime(e.target.value)}>
                  <option value="">—</option>
                  {previewCols.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="overflow-auto text-xs">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-line">
                    {previewCols.map((c) => (
                      <th key={c} className="pr-2">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewHead.map((r, i) => (
                    <tr key={i} className="border-b border-line/50">
                      {previewCols.map((c) => (
                        <td key={c} className="pr-2">
                          {r[c]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void confirmMappedImport()}
            >
              Confirmă importul mapat
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}
      {log.length > 0 && (
        <div className="card">
          <h2 className="mb-2 font-medium">Jurnal import</h2>
          <ul className="space-y-1 text-sm text-muted">
            {log.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
