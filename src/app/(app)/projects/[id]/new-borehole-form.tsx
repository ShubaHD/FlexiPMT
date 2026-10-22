"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewBoreholeForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch(`/api/projects/${projectId}/boreholes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: fd.get("code"), notes: fd.get("notes") }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Eroare.");
      return;
    }
    router.push(`/boreholes/${data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="field">
        <label htmlFor="code">Cod foraj *</label>
        <input id="code" name="code" required placeholder="BH-01" />
      </div>
      <div className="field">
        <label htmlFor="notes">Note</label>
        <input id="notes" name="notes" />
      </div>
      <button type="submit" className="btn btn-primary">
        Adaugă foraj
      </button>
      {error && <p className="w-full text-sm text-[var(--danger)]">{error}</p>}
    </form>
  );
}
