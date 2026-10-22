"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewTestForm({ boreholeId }: { boreholeId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const depth = fd.get("depthM");
    const res = await fetch(`/api/boreholes/${boreholeId}/tests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: fd.get("label"),
        depthM: depth ? Number(depth) : null,
        author: fd.get("author"),
        testDate: fd.get("testDate"),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Eroare.");
      return;
    }
    router.push(`/tests/${data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-4">
      <div className="field">
        <label htmlFor="label">Etichetă *</label>
        <input id="label" name="label" required defaultValue="Test 1" />
      </div>
      <div className="field">
        <label htmlFor="depthM">Adâncime (m)</label>
        <input id="depthM" name="depthM" type="number" step="0.01" />
      </div>
      <div className="field">
        <label htmlFor="author">Autor</label>
        <input id="author" name="author" />
      </div>
      <div className="field">
        <label htmlFor="testDate">Data test</label>
        <input id="testDate" name="testDate" type="date" />
      </div>
      <div className="sm:col-span-4">
        <button type="submit" className="btn btn-primary">
          Creează test gol
        </button>
        {error && <p className="mt-2 text-sm text-[var(--danger)]">{error}</p>}
      </div>
    </form>
  );
}
