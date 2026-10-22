"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  endpoint: string;
  confirmMessage: string;
  /** Unde navigăm după ștergere (ex. listă părinte). Dacă lipsește, doar refresh. */
  redirectTo?: string;
  label?: string;
  className?: string;
};

export function DeleteEntityButton({
  endpoint,
  confirmMessage,
  redirectTo,
  label = "Șterge",
  className = "btn btn-danger text-xs",
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (!window.confirm(confirmMessage)) return;
    setBusy(true);
    try {
      const res = await fetch(endpoint, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(
          typeof data.error === "string" ? data.error : "Ștergerea a eșuat."
        );
        return;
      }
      if (redirectTo) {
        router.push(redirectTo);
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      onClick={() => void onClick()}
    >
      {busy ? "Se șterge…" : label}
    </button>
  );
}
