"use client";

import type { PmtPayloadV1 } from "@/lib/schema/pmt-v1";
import type { ElastMetadata } from "@/lib/import/elast-csv";
import { defaultRequiredInputs } from "@/lib/schema/pmt-v1";

type Props = {
  payload: PmtPayloadV1;
  pending?: boolean;
  onChange: (next: PmtPayloadV1) => void;
  onSave: () => void;
};

function parseOptionalNumber(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function ElastMetaPanel({ payload, pending, onChange, onSave }: Props) {
  const meta = payload.elastMeta;
  if (!meta) return null;

  function patchMeta(
    patch: Partial<Omit<ElastMetadata, "factors">> & {
      factors?: Partial<ElastMetadata["factors"]>;
    }
  ) {
    const current = payload.elastMeta;
    if (!current) return;
    const nextMeta: ElastMetadata = {
      ...current,
      ...patch,
      factors: {
        ...current.factors,
        ...(patch.factors ?? {}),
      },
    };
    const ri = {
      ...defaultRequiredInputs(),
      ...(payload.requiredInputs ?? {}),
      tubeTypeFromCsv: nextMeta.tubeType,
    };
    onChange({
      ...payload,
      elastMeta: nextMeta,
      testFactors: nextMeta.factors,
      requiredInputs: ri,
    });
  }

  const f = meta.factors;

  return (
    <div className="card space-y-3 text-sm no-print">
      <div>
        <div className="font-medium">Metadate Elast Logger</div>
        <p className="mt-0.5 text-xs text-muted">
          Puteți corecta valorile dacă exportul CSV are o ciudățenie. Factorii
          sunt doar pentru trasabilitate — FlexiPMT nu reaplică calibrarea pe
          Pressure / dRi / R.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="field">
          <label htmlFor="elast-fileId">File ID</label>
          <input
            id="elast-fileId"
            value={meta.fileId ?? ""}
            onChange={(e) => patchMeta({ fileId: e.target.value || null })}
          />
        </div>
        <div className="field">
          <label htmlFor="elast-date">Date</label>
          <input
            id="elast-date"
            value={meta.testDate ?? ""}
            placeholder="YYYY-MM-DD"
            onChange={(e) => patchMeta({ testDate: e.target.value || null })}
          />
        </div>
        <div className="field">
          <label htmlFor="elast-time">Time</label>
          <input
            id="elast-time"
            value={meta.testTime ?? ""}
            placeholder="HH:MM:SS"
            onChange={(e) => patchMeta({ testTime: e.target.value || null })}
          />
        </div>
        <div className="field">
          <label htmlFor="elast-hole">Hole No.</label>
          <input
            id="elast-hole"
            value={meta.holeNo ?? ""}
            onChange={(e) => patchMeta({ holeNo: e.target.value || null })}
          />
        </div>
        <div className="field">
          <label htmlFor="elast-depth">Depth (m)</label>
          <input
            id="elast-depth"
            inputMode="decimal"
            value={meta.depthM ?? ""}
            onChange={(e) =>
              patchMeta({ depthM: parseOptionalNumber(e.target.value) })
            }
          />
        </div>
        <div className="field">
          <label htmlFor="elast-datasize">Data size</label>
          <input
            id="elast-datasize"
            inputMode="numeric"
            value={meta.dataSize ?? ""}
            onChange={(e) =>
              patchMeta({ dataSize: parseOptionalNumber(e.target.value) })
            }
          />
        </div>
        <div className="field">
          <label htmlFor="elast-tube">Tube</label>
          <input
            id="elast-tube"
            value={meta.tubeType ?? ""}
            onChange={(e) => patchMeta({ tubeType: e.target.value || null })}
          />
        </div>
        <div className="field">
          <label htmlFor="elast-a1">A(1) — factor presiune (pantă)</label>
          <input
            id="elast-a1"
            inputMode="decimal"
            value={f.factorA1 ?? ""}
            onChange={(e) =>
              patchMeta({
                factors: { factorA1: parseOptionalNumber(e.target.value) },
              })
            }
          />
        </div>
        <div className="field">
          <label htmlFor="elast-a2">A(2) — factor presiune (offset)</label>
          <input
            id="elast-a2"
            inputMode="decimal"
            value={f.factorA2 ?? ""}
            onChange={(e) =>
              patchMeta({
                factors: { factorA2: parseOptionalNumber(e.target.value) },
              })
            }
          />
        </div>
        <div className="field">
          <label htmlFor="elast-g">G — gain rază (R)</label>
          <input
            id="elast-g"
            inputMode="decimal"
            value={f.factorG ?? ""}
            onChange={(e) =>
              patchMeta({
                factors: { factorG: parseOptionalNumber(e.target.value) },
              })
            }
          />
        </div>
        <div className="field">
          <label htmlFor="elast-dria">dRi(A) — factor deplasare radială</label>
          <input
            id="elast-dria"
            inputMode="decimal"
            value={f.factorDriA ?? ""}
            onChange={(e) =>
              patchMeta({
                factors: { factorDriA: parseOptionalNumber(e.target.value) },
              })
            }
          />
        </div>
      </div>

      <div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          onClick={onSave}
        >
          Salvează metadate
        </button>
      </div>

      {(payload.rowIssues?.length ?? 0) > 0 && (
        <p className="text-[var(--warn)]">
          {payload.rowIssues!.length} probleme pe rânduri (incomplete / duplicate /
          neconvertibile) — nu au fost eliminate automat.
        </p>
      )}
    </div>
  );
}
