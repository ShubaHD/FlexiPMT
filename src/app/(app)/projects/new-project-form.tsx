"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewProjectForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: fd.get("code"),
        name: fd.get("name"),
        site: fd.get("site"),
        client: fd.get("client"),
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Eroare la creare.");
      return;
    }
    router.push(`/projects/${data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      <div className="field">
        <label htmlFor="code">Cod *</label>
        <input id="code" name="code" required placeholder="ex. PRJ-2026-01" />
      </div>
      <div className="field">
        <label htmlFor="name">Denumire *</label>
        <input id="name" name="name" required placeholder="Denumire proiect" />
      </div>
      <div className="field">
        <label htmlFor="site">Amplasament</label>
        <input id="site" name="site" />
      </div>
      <div className="field">
        <label htmlFor="client">Client</label>
        <input id="client" name="client" />
      </div>
      {error && <p className="text-sm text-[var(--danger)] sm:col-span-2">{error}</p>}
      <div className="sm:col-span-2">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Se creează…" : "Creează proiect"}
        </button>
      </div>
    </form>
  );
}
