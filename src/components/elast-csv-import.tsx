"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type Props = {
  /** Import pe foraj → creează test nou. */
  boreholeId?: string;
  /** Import pe test existent → înlocuiește punctele CSV. */
  testId?: string;
  author?: string;
  onImported?: (testId: string) => void;
  className?: string;
};

export function ElastCsvImport({
  boreholeId,
  testId,
  author,
  onImported,
  className,
}: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    fileName: string;
    text: string;
    pointsDetected: number;
    pointsValid: number;
    holeNo?: string;
    depthM?: number;
    fileId?: string;
  } | null>(null);

  const canConfirm = Boolean(testId || boreholeId);

  async function onPick(file: File) {
    setBusy(true);
    setError(null);
    setMsg(null);
    setPreview(null);
    try {
      const text = await file.text();
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
      const meta = data.metadata as {
        holeNo?: string;
        depthM?: number;
        fileId?: string;
      };
      setPreview({
        fileName: file.name,
        text,
        pointsDetected: Number(data.pointsDetected ?? 0),
        pointsValid: Number(data.pointsValid ?? 0),
        holeNo: meta?.holeNo,
        depthM: meta?.depthM,
        fileId: meta?.fileId,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!preview || !canConfirm) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/import/elast-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testId: testId || undefined,
          boreholeId: testId ? undefined : boreholeId,
          fileName: preview.fileName,
          text: preview.text,
          author,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import eșuat");
      const id = String(data.test.id);
      setPreview(null);
      setMsg(
        testId
          ? `CSV importat pe test (${data.pointsValid} puncte valide).`
          : `Test creat: ${data.test.label} (${data.pointsValid} puncte).`
      );
      onImported?.(id);
      if (!testId || testId !== id) {
        router.push(`/tests/${id}`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className ?? "card space-y-2 text-sm no-print"}>
      <div className="font-medium">Import CSV Elast Logger 3</div>
      <p className="text-xs text-muted">
        {testId
          ? "Încărcați fișierul pe acest test. Pressure/dRi/R rămân nemodificate; ΔV e calculat de FlexiPMT."
          : "Forajul e deja selectat. Importul creează un test nou pe acest foraj."}
      </p>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.txt,.xls,.CSV.xls,.org,.ORG"
        className="sr-only"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void onPick(f);
        }}
      />
      <button
        type="button"
        className="btn btn-primary"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
      >
        {busy ? "Se citește…" : "Alege fișier CSV"}
      </button>
      {preview && (
        <div className="space-y-2 rounded border border-line p-3">
          <div>
            <strong>{preview.fileName}</strong> — {preview.pointsDetected}{" "}
            puncte detectate, {preview.pointsValid} valide
            {preview.fileId ? ` · File ID ${preview.fileId}` : ""}
            {preview.holeNo ? ` · Hole ${preview.holeNo}` : ""}
            {preview.depthM != null ? ` · ${preview.depthM} m` : ""}
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !canConfirm}
            onClick={() => void confirm()}
          >
            {testId ? "Confirmă importul pe acest test" : "Confirmă importul pe foraj"}
          </button>
        </div>
      )}
      {error && <p className="text-[var(--danger)]">{error}</p>}
      {msg && <p className="text-muted">{msg}</p>}
    </div>
  );
}
