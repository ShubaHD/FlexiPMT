"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  boreholeId: string;
  code: string;
  notes: string | null;
};

export function EditBoreholeForm({ boreholeId, code, notes }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    const fd = new FormData(e.currentTarget);
    const res = await fetch(`/api/boreholes/${boreholeId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: fd.get("code"),
        notes: fd.get("notes"),
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Eroare la salvare.");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="field">
        <label htmlFor="edit-bh-code">Nume foraj *</label>
        <input
          id="edit-bh-code"
          name="code"
          required
          defaultValue={code}
        />
      </div>
      <div className="field min-w-[12rem] flex-1">
        <label htmlFor="edit-bh-notes">Note</label>
        <input
          id="edit-bh-notes"
          name="notes"
          defaultValue={notes ?? ""}
        />
      </div>
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? "Se salvează…" : "Salvează foraj"}
      </button>
      {error && <p className="w-full text-sm text-[var(--danger)]">{error}</p>}
      {saved && !error && (
        <p className="w-full text-sm text-[var(--ok)]">Salvat.</p>
      )}
    </form>
  );
}
