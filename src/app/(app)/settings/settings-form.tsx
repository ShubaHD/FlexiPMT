"use client";

import { useState } from "react";

type Initial = {
  companyName: string;
  address: string;
  phone: string;
  email: string;
  accreditation: string;
  logoDataUrl: string;
  preparedBy: string;
  verifiedBy: string;
};

const MAX_LOGO_BYTES = 400_000;

async function fileToLogoDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Selectați un fișier imagine (PNG, JPG, SVG, WebP).");
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Citirea fișierului a eșuat."));
    reader.readAsDataURL(file);
  });
  if (dataUrl.length > MAX_LOGO_BYTES * 1.4) {
    // Reîncercare: micșorare pe canvas (nu pentru SVG)
    if (file.type === "image/svg+xml") {
      throw new Error("Logo-ul SVG e prea mare. Folosiți PNG/JPG ≤ ~300 KB.");
    }
    return resizeImageDataUrl(dataUrl, 320, 120);
  }
  return dataUrl;
}

function resizeImageDataUrl(
  dataUrl: string,
  maxW: number,
  maxH: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width, maxH / img.height);
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas indisponibil"));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("Imagine invalidă"));
    img.src = dataUrl;
  });
}

export function SettingsForm({ initial }: { initial: Initial }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [logoDataUrl, setLogoDataUrl] = useState(initial.logoDataUrl);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: fd.get("companyName"),
          address: fd.get("address"),
          phone: fd.get("phone"),
          email: fd.get("email"),
          accreditation: fd.get("accreditation"),
          logoDataUrl: logoDataUrl || null,
          preparedBy: fd.get("preparedBy"),
          verifiedBy: fd.get("verifiedBy"),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(
          typeof data.error === "string" && data.error
            ? data.error
            : `Salvare eșuată (HTTP ${res.status})`
        );
        return;
      }
      setMsg("Setările au fost salvate.");
      if (typeof data.logoDataUrl === "string" || data.logoDataUrl === null) {
        setLogoDataUrl(data.logoDataUrl ?? "");
      }
    } catch (ex) {
      setErr(
        ex instanceof Error
          ? `Salvare eșuată: ${ex.message}`
          : "Salvare eșuată"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="field">
        <label htmlFor="companyName">Denumire firmă</label>
        <input
          id="companyName"
          name="companyName"
          defaultValue={initial.companyName}
        />
      </div>
      <div className="field">
        <label htmlFor="address">Adresă</label>
        <input id="address" name="address" defaultValue={initial.address} />
      </div>
      <div className="field">
        <label htmlFor="phone">Telefon</label>
        <input id="phone" name="phone" defaultValue={initial.phone} />
      </div>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" defaultValue={initial.email} />
      </div>
      <div className="field">
        <label htmlFor="accreditation">Acreditare</label>
        <input
          id="accreditation"
          name="accreditation"
          defaultValue={initial.accreditation}
        />
      </div>

      <fieldset className="space-y-2 rounded border border-line p-3">
        <legend className="px-1 text-sm font-medium">Logo raport</legend>
        <p className="text-xs text-muted">
          Apare în antetul PDF. PNG/JPG/WebP (sau SVG mic). Se stochează local în
          setări.
        </p>
        {logoDataUrl ? (
          <div className="flex flex-wrap items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoDataUrl}
              alt="Logo laborator"
              className="max-h-16 max-w-[12rem] object-contain"
            />
            <button
              type="button"
              className="btn text-sm"
              onClick={() => setLogoDataUrl("")}
            >
              Elimină logo
            </button>
          </div>
        ) : (
          <p className="text-sm text-muted">Niciun logo încărcat.</p>
        )}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setErr(null);
            void fileToLogoDataUrl(f)
              .then(setLogoDataUrl)
              .catch((ex) =>
                setErr(ex instanceof Error ? ex.message : "Import logo eșuat")
              );
          }}
        />
      </fieldset>

      <fieldset className="space-y-3 rounded border border-line p-3">
        <legend className="px-1 text-sm font-medium">
          Întocmit / Verificat (subsol raport)
        </legend>
        <div className="field">
          <label htmlFor="preparedBy">Întocmit</label>
          <input
            id="preparedBy"
            name="preparedBy"
            defaultValue={initial.preparedBy}
            placeholder="Nume și, opțional, funcție"
          />
        </div>
        <div className="field">
          <label htmlFor="verifiedBy">Verificat</label>
          <input
            id="verifiedBy"
            name="verifiedBy"
            defaultValue={initial.verifiedBy}
            placeholder="Nume și, opțional, funcție"
          />
        </div>
      </fieldset>

      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? "Se salvează…" : "Salvează"}
      </button>
      {msg && <p className="text-sm text-[var(--ok)]">{msg}</p>}
      {err && <p className="text-sm text-[var(--danger)]">{err}</p>}
    </form>
  );
}
