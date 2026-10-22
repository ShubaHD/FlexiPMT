"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  projectId: string;
  code: string;
  name: string;
  site: string | null;
  client: string | null;
};

export function EditProjectForm({
  projectId,
  code,
  name,
  site,
  client,
}: Props) {
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
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PUT",
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
      setError(data.error || "Eroare la salvare.");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      <div className="field">
        <label htmlFor="edit-code">Cod *</label>
        <input
          id="edit-code"
          name="code"
          required
          defaultValue={code}
        />
      </div>
      <div className="field">
        <label htmlFor="edit-name">Denumire *</label>
        <input
          id="edit-name"
          name="name"
          required
          defaultValue={name}
        />
      </div>
      <div className="field">
        <label htmlFor="edit-site">Amplasament</label>
        <input id="edit-site" name="site" defaultValue={site ?? ""} />
      </div>
      <div className="field">
        <label htmlFor="edit-client">Client</label>
        <input id="edit-client" name="client" defaultValue={client ?? ""} />
      </div>
      {error && (
        <p className="text-sm text-[var(--danger)] sm:col-span-2">{error}</p>
      )}
      {saved && !error && (
        <p className="text-sm text-[var(--ok)] sm:col-span-2">Salvat.</p>
      )}
      <div className="sm:col-span-2">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Se salvează…" : "Salvează proiect"}
        </button>
      </div>
    </form>
  );
}
