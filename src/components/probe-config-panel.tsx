"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  Interpretation,
  PmtPayloadV1,
  RequiredInputs,
} from "@/lib/schema/pmt-v1";
import { defaultRequiredInputs } from "@/lib/schema/pmt-v1";
import {
  DIGITAL_SONDE_LIMIT_TABLE,
  NOMINAL_MAX_PRESSURE_KPA,
  NOMINAL_MAX_PRESSURE_MPA,
  TABLE_DISCLAIMER,
  formatMPaKPa,
  kPaToMPa,
  packerDiametersForProbe,
  parseElastTubeType,
  suggestPracticalLimitMPa,
  type ProbeModelId,
} from "@/lib/probe/oyo-probe-limits";

type Props = {
  payload: PmtPayloadV1;
  onChange: (
    ri: RequiredInputs,
    interpretationPatch?: Partial<Interpretation>
  ) => void;
};

export function ProbeConfigPanel({ payload, onChange }: Props) {
  const ri = { ...defaultRequiredInputs(), ...(payload.requiredInputs ?? {}) };
  const interp = payload.interpretation;
  const csvTube = payload.elastMeta?.tubeType ?? ri.tubeTypeFromCsv;
  const parsed = useMemo(() => parseElastTubeType(csvTube), [csvTube]);

  const suggestion = useMemo(
    () =>
      suggestPracticalLimitMPa({
        packerDiameterMm: ri.packerDiameterMm,
        tubeSize: ri.tubeSize,
        packerHardness: ri.packerHardness,
        boreholeDiameterMm: ri.boreholeDiameterMm,
      }),
    [
      ri.packerDiameterMm,
      ri.tubeSize,
      ri.packerHardness,
      ri.boreholeDiameterMm,
    ]
  );

  const packerOpts = packerDiametersForProbe(
    (ri.probeModel ?? "digital_sonde_4301") as ProbeModelId
  );

  const [ruptureDraft, setRuptureDraft] = useState(
    interp.rupturePressureKPa != null ? String(interp.rupturePressureKPa) : ""
  );
  useEffect(() => {
    setRuptureDraft(
      interp.rupturePressureKPa != null ? String(interp.rupturePressureKPa) : ""
    );
  }, [interp.rupturePressureKPa]);

  function patch(partial: Partial<RequiredInputs>) {
    onChange({ ...ri, ...partial });
  }

  function patchInterp(partial: Partial<Interpretation>) {
    onChange(ri, partial);
  }

  function applyCsvPrefill() {
    patch({
      tubeTypeFromCsv: csvTube,
      tubeSize: parsed.tubeSize ?? ri.tubeSize,
      packerHardness: parsed.packerHardness ?? ri.packerHardness,
      packerDiameterMm: parsed.packerDiameterMm ?? ri.packerDiameterMm,
      tubeConfigConfirmed: false,
      nominalMaxPressureKPa:
        ri.nominalMaxPressureKPa ?? NOMINAL_MAX_PRESSURE_KPA,
    });
  }

  function applySuggestedLimit() {
    if (suggestion.kPa == null) return;
    patch({
      apparatusLimitKPa: suggestion.kPa,
      practicalLimitConfirmed: false,
      nominalMaxPressureKPa:
        ri.nominalMaxPressureKPa ?? NOMINAL_MAX_PRESSURE_KPA,
    });
  }

  const pMax = payload.interpretation.pMaxKPa;
  const practical = ri.apparatusLimitKPa;
  const nominal = ri.nominalMaxPressureKPa ?? NOMINAL_MAX_PRESSURE_KPA;

  return (
    <div className="card w-full min-w-0 space-y-4">
      <h2 className="font-medium">Sondă / packer și limite de presiune</h2>
      <p className="text-xs text-muted">
        Surse: Elast Logger (Tube type) + tabel OYO Digital Sonde. Valorile din
        tabel sunt <strong>orientative</strong>; confirmați configurația și
        limita practică.
      </p>

      <div className="rounded border border-line bg-accent-soft/20 px-3 py-2 text-sm">
        <div>
          Tube type din CSV: <strong>{csvTube ?? "—"}</strong>
          {parsed.tubeSize && (
            <>
              {" "}
              → precompletare {parsed.tubeSize}
              {parsed.packerHardness ? ` / ${parsed.packerHardness}` : ""}
              {parsed.packerDiameterMm
                ? ` / packer ${parsed.packerDiameterMm} mm`
                : ""}
            </>
          )}
        </div>
        <button type="button" className="btn text-sm mt-2" onClick={applyCsvPrefill}>
          Precompletează din CSV (necesită confirmare)
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        <div className="field">
          <label>Model sondă</label>
          <select
            value={ri.probeModel ?? "digital_sonde_4301"}
            onChange={(e) => {
              const model = e.target.value as RequiredInputs["probeModel"];
              const allowed = packerDiametersForProbe(model as ProbeModelId);
              patch({
                probeModel: model,
                packerDiameterMm:
                  ri.packerDiameterMm != null &&
                  allowed.includes(ri.packerDiameterMm)
                    ? ri.packerDiameterMm
                    : allowed[0] ?? null,
                tubeConfigConfirmed: false,
              });
            }}
          >
            <option value="digital_sonde_4301">
              Elastmeter Digital Sonde (4301)
            </option>
            <option value="hq_4180">
              Elastmeter HQ (4180) + converting box Logger 3i
            </option>
            <option value="other">Alt model</option>
          </select>
        </div>
        <div className="field">
          <label>Tip tub (BX / NX)</label>
          <select
            value={ri.tubeSize ?? ""}
            onChange={(e) => {
              const tubeSize = (e.target.value || null) as RequiredInputs["tubeSize"];
              const d =
                tubeSize === "NX" ? 70 : tubeSize === "BX" ? 60 : ri.packerDiameterMm;
              patch({
                tubeSize,
                packerDiameterMm: d,
                tubeConfigConfirmed: false,
              });
            }}
          >
            <option value="">—</option>
            <option value="BX">BX</option>
            <option value="NX">NX</option>
          </select>
        </div>
        <div className="field">
          <label>Tip packer (Hard / Soft)</label>
          <select
            value={ri.packerHardness ?? ""}
            onChange={(e) =>
              patch({
                packerHardness: (e.target.value ||
                  null) as RequiredInputs["packerHardness"],
                tubeConfigConfirmed: false,
              })
            }
          >
            <option value="">—</option>
            <option value="Hard">Hard</option>
            <option value="Soft">Soft</option>
          </select>
        </div>
        <div className="field">
          <label>Diametru packer [mm]</label>
          <select
            value={ri.packerDiameterMm ?? ""}
            onChange={(e) =>
              patch({
                packerDiameterMm:
                  e.target.value === "" ? null : Number(e.target.value),
                tubeConfigConfirmed: false,
              })
            }
          >
            <option value="">—</option>
            {packerOpts.map((d) => (
              <option key={d} value={d}>
                {d} mm
                {d === 60 ? " (BX)" : d === 70 ? " (NX)" : " (doar modele compatibile)"}
              </option>
            ))}
          </select>
          {(ri.probeModel === "digital_sonde_4301" || !ri.probeModel) && (
            <span className="text-[11px] text-muted">
              Digital Sonde: 60 mm (BX) și 70 mm (NX) — tabel OYO. Packere 80/100 mm
              apar la HQ / alte sonde.
            </span>
          )}
        </div>
        <div className="field">
          <label>Diametru foraj la nivelul testului [mm]</label>
          <input
            type="number"
            step="any"
            value={ri.boreholeDiameterMm ?? ""}
            onChange={(e) =>
              patch({
                boreholeDiameterMm:
                  e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
        </div>
        <div className="field flex flex-col justify-end">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={ri.tubeConfigConfirmed}
              onChange={(e) =>
                patch({ tubeConfigConfirmed: e.target.checked })
              }
            />
            Confirm tip tub / packer pentru acest test
          </label>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-line text-muted">
              <th className="py-1 pr-2">Packer</th>
              <th className="py-1 pr-2">Foraj ≤</th>
              <th className="py-1 pr-2">Hard</th>
              <th className="py-1 pr-2">Soft</th>
            </tr>
          </thead>
          <tbody>
            {DIGITAL_SONDE_LIMIT_TABLE.map((r, i) => (
              <tr key={i} className="border-b border-line/50">
                <td className="py-1 pr-2">
                  {r.packerDiameterMm} mm ({r.tubeSize})
                </td>
                <td className="py-1 pr-2">{r.boreholeMaxMm} mm</td>
                <td className="py-1 pr-2">{formatMPaKPa(r.hardMPa)}</td>
                <td className="py-1 pr-2">{formatMPaKPa(r.softMPa)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-[11px] text-muted">{TABLE_DISCLAIMER}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded border border-line p-3 text-sm">
          <div className="text-xs text-muted">1. Maxim nominal aparat/sondă</div>
          <div className="font-medium">
            {NOMINAL_MAX_PRESSURE_MPA} MPa ={" "}
            {NOMINAL_MAX_PRESSURE_KPA.toLocaleString("ro-RO")} kPa
          </div>
          <input
            type="number"
            className="mt-1 w-full"
            value={ri.nominalMaxPressureKPa ?? NOMINAL_MAX_PRESSURE_KPA}
            onChange={(e) =>
              patch({
                nominalMaxPressureKPa:
                  e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
          <span className="text-[11px] text-muted">kPa (editabil dacă e cazul)</span>
        </div>
        <div className="rounded border border-line p-3 text-sm">
          <div className="text-xs text-muted">2. Limită practică admisă (config.)</div>
          <div className="font-medium">
            {practical != null
              ? `${kPaToMPa(practical)} MPa = ${practical.toLocaleString("ro-RO")} kPa`
              : "—"}
          </div>
          <input
            type="number"
            className="mt-1 w-full"
            value={practical ?? ""}
            placeholder="kPa"
            onChange={(e) =>
              patch({
                apparatusLimitKPa:
                  e.target.value === "" ? null : Number(e.target.value),
                practicalLimitConfirmed: false,
              })
            }
          />
          <button
            type="button"
            className="btn text-xs mt-1"
            disabled={suggestion.kPa == null}
            onClick={applySuggestedLimit}
          >
            Aplică sugestia din tabel
          </button>
          <p className="mt-1 text-[11px] text-muted">{suggestion.message}</p>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={ri.practicalLimitConfirmed}
              onChange={(e) =>
                patch({ practicalLimitConfirmed: e.target.checked })
              }
            />
            Confirm limita practică pentru acest test
          </label>
        </div>
        <div className="rounded border border-line p-3 text-sm space-y-2">
          <div className="text-xs text-muted">3. pMax efectiv înregistrat</div>
          <div className="font-medium">
            {pMax != null
              ? `${kPaToMPa(pMax).toFixed(3)} MPa = ${pMax.toFixed(1)} kPa`
              : "—"}
          </div>
          <p className="text-[11px] text-muted">
            Din Pressure pe punctele active. Nu este pL / rupere.
          </p>
          {practical != null && pMax != null && (
            <p className="text-xs">
              pMax vs limită practică:{" "}
              {pMax >= practical * 0.98
                ? "≥ ~98% din limita practică"
                : "sub limita practică"}
            </p>
          )}
          <div className="field">
            <label className="text-xs">
              Rupere observată (kPa) — doar dacă a fost consemnată
            </label>
            <input
              type="number"
              value={ruptureDraft}
              onChange={(e) => setRuptureDraft(e.target.value)}
              onBlur={() => {
                const v = ruptureDraft.trim();
                patchInterp({
                  rupturePressureKPa: v === "" ? null : Number(v),
                  ruptureOrigin: v === "" ? "unavailable" : "manual",
                  apparatusLimitReachedWithoutRupture:
                    v === ""
                      ? interp.apparatusLimitReachedWithoutRupture
                      : false,
                });
              }}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={interp.apparatusLimitReachedWithoutRupture}
              onChange={(e) =>
                patchInterp({
                  apparatusLimitReachedWithoutRupture: e.target.checked,
                  apparatusLimitNote: e.target.checked
                    ? `Limita practică admisă a configurației${
                        practical != null
                          ? ` (${kPaToMPa(practical)} MPa = ${practical} kPa)`
                          : ""
                      } atinsă; ruperea nu a fost observată`
                    : null,
                })
              }
            />
            Limita practică atinsă; ruperea nu a fost observată
          </label>
        </div>
      </div>
    </div>
  );
}
