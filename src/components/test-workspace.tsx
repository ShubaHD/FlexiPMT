"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PmtChart } from "@/components/pmt-chart";
import { ProgrammePanel } from "@/components/programme-panel";
import { RequiredInputsForm } from "@/components/required-inputs-form";
import { ProbeConfigPanel } from "@/components/probe-config-panel";
import { CalibrationPanel } from "@/components/calibration-panel";
import { ElastCsvImport } from "@/components/elast-csv-import";
import { ElastMetaPanel } from "@/components/elast-meta-panel";
import { DerivedParamsPanel } from "@/components/derived-params-panel";
import { defaultRequiredInputs } from "@/lib/schema/pmt-v1";
import type { HistoryEntry, PmtPayloadV1, WorkingPoint } from "@/lib/schema/pmt-v1";
import { activePoints, missingRequiredFields } from "@/lib/schema/pmt-v1";
import { STATUS_LABELS, type TestStatus } from "@/lib/types";
import {
  activeIndicesFromCsvNumbers,
  availableResultKeys,
  checkProgrammeABand,
  programmeABandForKey,
  selectionCoversLoop,
  selectionToOverride,
} from "@/lib/calc/programme-moduli";
import { segmentPressureCurve } from "@/lib/calc/segment-curve";
import type {
  ChartAxisMode,
  ChartTickSettings,
} from "@/lib/calc/programme-types";
import { defaultChartTickSettings } from "@/lib/chart/chart-ticks";

type TestDto = {
  id: string;
  label: string;
  depthM: number | null;
  status: string;
  author: string | null;
  testDate: string | null;
  sourceFileName: string | null;
  payload: PmtPayloadV1;
  history: HistoryEntry[];
  borehole: {
    id: string;
    code: string;
    project: { id: string; code: string; name: string; site: string | null };
  };
  warnings?: string[];
  issues?: string[];
};

export function TestWorkspace({ initial }: { initial: TestDto }) {
  const router = useRouter();
  const [test, setTest] = useState(initial);
  const [payload, setPayload] = useState(initial.payload);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [editPressure, setEditPressure] = useState("");
  const [editVolume, setEditVolume] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [psSelectMode, setPsSelectMode] = useState(false);
  const [draftIndices, setDraftIndices] = useState<number[]>([]);
  const [selReason, setSelReason] = useState("");

  useEffect(() => {
    setTest(initial);
    setPayload(initial.payload);
  }, [initial]);

  useEffect(() => {
    // La schimbarea țintei, pornește draft gol (fără preselecție)
    setDraftIndices([]);
  }, [payload.programmeState?.selectionTargetKey]);

  const selected = useMemo(
    () => payload.workingPoints.find((p) => p.id === payload.selectedPointId) ?? null,
    [payload.workingPoints, payload.selectedPointId]
  );

  useEffect(() => {
    if (selected) {
      setEditPressure(String(selected.pressureKPa));
      setEditVolume(String(selected.volumeCm3));
    } else {
      setEditPressure("");
      setEditVolume("");
    }
  }, [selected]);

  const save = useCallback(
    async (
      next: PmtPayloadV1,
      opts?: { historyAction?: string; historyDetail?: string; status?: string; meta?: Partial<TestDto> }
    ) => {
      setErr(null);
      setMsg(null);
      const res = await fetch(`/api/tests/${test.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payload: next,
          historyAction: opts?.historyAction,
          historyDetail: opts?.historyDetail,
          status: opts?.status,
          label: opts?.meta?.label,
          depthM: opts?.meta?.depthM,
          author: opts?.meta?.author,
          testDate: opts?.meta?.testDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Salvare eșuată.");
        return;
      }
      setTest((t) => ({ ...t, ...data, payload: data.payload, history: data.history }));
      setPayload(data.payload);
      const notes = [...(data.issues ?? []), ...(data.warnings ?? [])];
      setMsg(
        notes.length
          ? `Salvat. Atenții: ${notes.slice(0, 3).join(" · ")}`
          : "Salvat."
      );
      startTransition(() => router.refresh());
    },
    [test.id, router]
  );

  const updatePoints = (updater: (pts: WorkingPoint[]) => WorkingPoint[], action: string, detail: string) => {
    const next = {
      ...payload,
      workingPoints: updater(payload.workingPoints),
    };
    setPayload(next);
    void save(next, { historyAction: action, historyDetail: detail });
  };

  const onSelect = (id: string | null) => {
    const next = { ...payload, selectedPointId: id };
    setPayload(next);
  };

  const [excludeReason, setExcludeReason] = useState("Exclus de utilizator");

  const excludeSelected = () => {
    if (!selected) return;
    const reason = excludeReason.trim() || "Exclus de utilizator";
    updatePoints(
      (pts) =>
        pts.map((p) =>
          p.id === selected.id
            ? { ...p, status: "excluded", excludeReason: reason }
            : p
        ),
      "exclude",
      `Punct #${selected.index} exclus: ${reason}`
    );
  };

  const reinstateSelected = () => {
    if (!selected) return;
    updatePoints(
      (pts) =>
        pts.map((p) =>
          p.id === selected.id
            ? { ...p, status: "active", excludeReason: null }
            : p
        ),
      "reinstate",
      `Punct #${selected.index} reintrodus`
    );
  };

  const applyEdit = () => {
    if (!selected) return;
    const pK = Number(editPressure.replace(",", "."));
    const v = Number(editVolume.replace(",", "."));
    if (!Number.isFinite(pK) || !Number.isFinite(v)) {
      setErr("Valorile de editare trebuie să fie numerice.");
      return;
    }
    updatePoints(
      (pts) =>
        pts.map((p) =>
          p.id === selected.id
            ? {
                ...p,
                status: "edited",
                originalPressureKPa: p.originalPressureKPa ?? p.pressureKPa,
                originalVolumeCm3: p.originalVolumeCm3 ?? p.volumeCm3,
                pressureKPa: pK,
                pressureMPa: pK / 1000,
                volumeCm3: v,
              }
            : p
        ),
      "edit",
      `Punct #${selected.index} editat`
    );
  };

  const undoEdit = () => {
    if (!selected || selected.status !== "edited") return;
    updatePoints(
      (pts) =>
        pts.map((p) =>
          p.id === selected.id
            ? {
                ...p,
                status: "active",
                pressureKPa: p.originalPressureKPa ?? p.pressureKPa,
                pressureMPa: (p.originalPressureKPa ?? p.pressureKPa) / 1000,
                volumeCm3: p.originalVolumeCm3 ?? p.volumeCm3,
                originalPressureKPa: null,
                originalVolumeCm3: null,
              }
            : p
        ),
      "undo-edit",
      `Anulare editare punct #${selected.index}`
    );
  };

  const interp = payload.interpretation;
  const missing = missingRequiredFields(payload);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 no-print">
        <div>
          <div className="text-sm text-muted">
            {test.borehole.project.code} / {test.borehole.code}
          </div>
          <h1 className="font-[family-name:var(--font-dm)] text-2xl font-semibold text-ink">
            {test.label}
          </h1>
          <div className="mt-1 flex flex-wrap gap-2 text-sm">
            <span
              className={`badge ${
                test.status === "IMPORTED"
                  ? "badge-imported"
                  : test.status === "FINALIZED"
                    ? "badge-final"
                    : ""
              }`}
            >
              {STATUS_LABELS[test.status as TestStatus] ?? test.status}
            </span>
            <span className="badge">
              Raport: {payload.reportStatus ?? "draft"}
            </span>
            {test.sourceFileName && (
              <span className="text-muted">Sursă: {test.sourceFileName}</span>
            )}
            {test.depthM != null && (
              <span className="text-muted">Adâncime: {test.depthM} m</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className="rounded border border-line px-2 py-1 text-sm"
            value={test.status}
            onChange={(e) => {
              const nextStatus = e.target.value;
              if (
                (nextStatus === "VERIFIED" || nextStatus === "FINALIZED") &&
                missing.length > 0
              ) {
                setErr(
                  `Nu puteți marca testul ca verificat/finalizat: lipsesc ${missing.join("; ")}.`
                );
                return;
              }
              void save(payload, {
                status: nextStatus,
                historyAction: "status",
                historyDetail: `Stare → ${nextStatus}`,
              });
            }}
          >
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending}
            onClick={() =>
              void save(payload, {
                historyAction: "save",
                historyDetail: "Salvare manuală",
              })
            }
          >
            Salvează
          </button>
          <a href={`/tests/${test.id}/report`} className="btn">
            Raport
          </a>
        </div>
      </div>

      {(msg || err) && (
        <div
          className={`rounded border px-3 py-2 text-sm no-print ${
            err ? "border-red-300 bg-red-50 text-[var(--danger)]" : "border-line bg-white text-muted"
          }`}
        >
          {err || msg}
        </div>
      )}

      <ElastCsvImport
        testId={test.id}
        author={test.author ?? undefined}
        onImported={() => {
          setMsg("CSV importat pe test.");
        }}
      />

      <ElastMetaPanel
        payload={payload}
        pending={pending}
        onChange={setPayload}
        onSave={() =>
          void save(payload, {
            historyAction: "elast-meta",
            historyDetail: "Corecție metadate Elast Logger",
            meta: {
              depthM: payload.elastMeta?.depthM ?? null,
              testDate: payload.elastMeta?.testDate ?? null,
            },
          })
        }
      />

      <ProgrammePanel
        payload={payload}
        author={test.author ?? undefined}
        reason={selReason}
        onReasonChange={setSelReason}
        onApplyLoopIndices={(indices) => {
          setSelectMode(true);
          setDraftIndices(indices);
          setMsg(
            `Buclă încărcată pe draft (${indices.length} puncte). Verificați pe grafic și apăsați Aplică.`
          );
        }}
        onChange={(next) => {
          const prevProg = payload.programmeState?.programme;
          const prevKey = payload.programmeState?.selectionTargetKey;
          const nextProg = next.programmeState?.programme;
          const nextKey = next.programmeState?.selectionTargetKey;
          // Păstrează draft-ul pe grafic dacă doar se editează motiv / setări —
          // reset doar la schimbare program sau rezultat țintă
          const resetDraft =
            prevProg !== nextProg || prevKey !== nextKey;
          setPayload(next);
          if (resetDraft) {
            setSelectMode(false);
            setDraftIndices([]);
          }
          void save(next, {
            historyAction: "programme",
            historyDetail: `Program ${nextProg ?? "?"}${
              nextKey ? ` · ${nextKey}` : ""
            }`,
          });
        }}
      />

      <div className="card w-full min-w-0 space-y-2">
        <h2 className="mb-1 font-medium">Grafic</h2>
        <p className="text-xs text-muted no-print">
          Implicit p–R (comparabil OYO). ΔV FlexiPMT e derivat din R — nu e volum
          măsurat de Elast. Selecțiile se salvează pe Number CSV.
        </p>
        <PmtChart
          points={payload.workingPoints}
          selectedPointId={payload.selectedPointId}
          onSelect={onSelect}
          psKPa={interp.psKPa}
          apparatusLimitKPa={interp.apparatusLimitKPa}
          chartAxisMode={payload.programmeState?.chartAxisMode ?? "p_R"}
          onChartAxisModeChange={(mode: ChartAxisMode) => {
            if (!payload.programmeState) return;
            const next = {
              ...payload,
              programmeState: {
                ...payload.programmeState,
                chartAxisMode: mode,
              },
            };
            setPayload(next);
            void save(next, {
              historyAction: "chart-axis",
              historyDetail: `Axa grafic: ${mode}`,
            });
          }}
          chartTickSettings={
            payload.programmeState?.chartTickSettings ??
            defaultChartTickSettings()
          }
          onChartTickSettingsChange={(settings: ChartTickSettings) => {
            if (!payload.programmeState) return;
            const next = {
              ...payload,
              programmeState: {
                ...payload.programmeState,
                chartTickSettings: settings,
              },
            };
            setPayload(next);
            void save(next, {
              historyAction: "chart-ticks",
              historyDetail: `Gradații X=${settings.x.mode}${
                settings.x.majorStep != null ? `:${settings.x.majorStep}` : ""
              }, Y=${settings.y.mode}${
                settings.y.majorStep != null ? `:${settings.y.majorStep}` : ""
              }`,
            });
          }}
          boreholeDiameterMm={
            payload.requiredInputs?.boreholeDiameterMm ?? null
          }
          fitOverrides={(() => {
            const ps = payload.programmeState;
            if (!ps) return undefined;
            const keys = new Set(availableResultKeys(ps.programme));
            return ps.fitOverrides.filter((o) => keys.has(o.resultKey));
          })()}
          selectionTargetKey={payload.programmeState?.selectionTargetKey}
          selectionHint={(() => {
            const ps = payload.programmeState;
            const key = ps?.selectionTargetKey;
            if (
              !selectMode ||
              !ps ||
              ps.programme !== "A" ||
              !key ||
              !/^GU\d+$|^GR\d+$/.test(key) ||
              draftIndices.length < 2
            ) {
              return null;
            }
            const active = activePoints(payload.workingPoints);
            const band = checkProgrammeABand(
              key,
              active,
              draftIndices,
              draftIndices.map((i) => active[i])
            );
            if (!band.outside) {
              return `Banda 30–70% OK pentru ${key}. Apăsați Aplică.`;
            }
            if (selReason.trim()) {
              return `${key}: în afara 30–70% — se va marca ca abatere (motiv completat).`;
            }
            return `${key}: selecția iese din banda 30–70% (între liniile punctate). Restrângeți selecția SAU completați „Motiv” în panoul Interpretare, apoi Aplică.`;
          })()}
          onClipDraftToBand={(() => {
            const ps = payload.programmeState;
            const key = ps?.selectionTargetKey;
            if (
              !ps ||
              ps.programme !== "A" ||
              !key ||
              !/^GU\d+$|^GR\d+$/.test(key)
            ) {
              return undefined;
            }
            return () => {
              const active = activePoints(payload.workingPoints);
              const est = programmeABandForKey(
                key,
                active,
                draftIndices
              );
              if (!est) {
                setErr(
                  "Nu s-a putut determina bucla (pi / p1.1) pentru banda 30–70%."
                );
                return;
              }
              if (draftIndices.length === 0) {
                setErr(
                  "Selectați mai întâi câteva puncte pe ramura de descărcare (GUi) sau reîncărcare (GRi)."
                );
                return;
              }
              const clipped = draftIndices.filter((i) => {
                const p = active[i]?.pressureKPa;
                return (
                  p != null && p >= est.pLo - 1 && p <= est.pHi + 1
                );
              });
              if (clipped.length < 2) {
                setErr(
                  "După restrângere la 30–70% rămân sub 2 puncte. Selectați mai multe puncte pe mijlocul ramurii (între liniile 30% și 70%)."
                );
                window.alert(
                  "Prea puține puncte în banda 30–70%. Selectați mijlocul ramurii (între liniile punctate 30% și 70%), nu vârfurile buclei."
                );
                return;
              }
              setDraftIndices(clipped);
              setErr(null);
              setMsg(
                `Draft restrâns la banda 30–70% (bucla ${est.loopIndex ?? "?"}): ${clipped.length} puncte. Apăsați Aplică.`
              );
            };
          })()}
          fitActiveIndices={(() => {
            const key = payload.programmeState?.selectionTargetKey;
            const ov = payload.programmeState?.fitOverrides.find(
              (o) => o.resultKey === key
            );
            if (!ov) return [];
            const active = activePoints(payload.workingPoints);
            if (ov.csvPointNumbers?.length) {
              return activeIndicesFromCsvNumbers(active, ov.csvPointNumbers);
            }
            return (
              payload.results.find((r) => r.key === key)?.usedActiveIndices ??
              ov.activeIndices ??
              []
            );
          })()}
          fitResult={
            payload.results.find(
              (r) => r.key === payload.programmeState?.selectionTargetKey
            ) ?? null
          }
          isoBandKPa={(() => {
            const key = payload.programmeState?.selectionTargetKey;
            if (!key || payload.programmeState?.programme !== "A") return null;
            if (!/^GU\d+$|^GR\d+$/.test(key)) return null;
            const active = activePoints(payload.workingPoints);
            // Bandă fixă pe bucla i (pi–p1.1) — nu pe draft, ca liniile să nu „fugă”
            const est = programmeABandForKey(
              key,
              active,
              selectMode ? draftIndices : []
            );
            return est ? { pLo: est.pLo, pHi: est.pHi } : null;
          })()}
          selectMode={selectMode}
          selectionReason={selReason}
          onSelectionReasonChange={setSelReason}
          psSelectMode={psSelectMode}
          onPsSelectModeChange={setPsSelectMode}
          psCsvPointNumber={payload.requiredInputs?.psCsvPointNumber ?? null}
          onPickPsPoint={(csvNumber) => {
            const pt = payload.workingPoints.find((p) => p.index === csvNumber);
            if (!pt) return;
            const ri = {
              ...defaultRequiredInputs(),
              ...(payload.requiredInputs ?? {}),
              psCsvPointNumber: csvNumber,
              psManualKPa: pt.pressureKPa,
              acceptAutoPs: false,
            };
            const next = {
              ...payload,
              requiredInputs: ri,
              interpretation: {
                ...payload.interpretation,
                psKPa: pt.pressureKPa,
                psOrigin: "manual" as const,
              },
            };
            setPsSelectMode(false);
            setPayload(next);
            setMsg(
              `ps setat din CSV #${csvNumber}: ${pt.pressureKPa.toFixed(1)} kPa (${(pt.pressureKPa / 1000).toFixed(3)} MPa).`
            );
            void save(next, {
              historyAction: "ps-point",
              historyDetail: `ps din CSV #${csvNumber}: ${pt.pressureKPa.toFixed(1)} kPa`,
            });
          }}
          onSelectModeChange={(on) => {
            if (on && !payload.programmeState?.selectionTargetKey) {
              setErr(
                "Alegeți programul și rezultatul în panoul Interpretare pe program, apoi activați selecția."
              );
              return;
            }
            setSelectMode(on);
            if (on) {
              setPsSelectMode(false);
              const key = payload.programmeState?.selectionTargetKey;
              const ov = payload.programmeState?.fitOverrides.find(
                (o) => o.resultKey === key
              );
              const active = activePoints(payload.workingPoints);
              const existing =
                ov?.csvPointNumbers?.length
                  ? activeIndicesFromCsvNumbers(active, ov.csvPointNumbers)
                  : ov?.activeIndices ?? [];
              setDraftIndices([...existing]);
            } else {
              setDraftIndices([]);
            }
          }}
          selectionIndices={selectMode ? draftIndices : undefined}
          onSelectionIndicesChange={setDraftIndices}
          onCancelDraft={() => {
            setDraftIndices([]);
          }}
          onResetResultSelection={() => {
            setDraftIndices([]);
            setSelectMode(false);
            const key = payload.programmeState?.selectionTargetKey;
            if (!key || !payload.programmeState) return;
            const next = {
              ...payload,
              programmeState: {
                ...payload.programmeState,
                fitOverrides: payload.programmeState.fitOverrides.filter(
                  (o) => o.resultKey !== key
                ),
              },
            };
            setPayload(next);
            void save(next, {
              historyAction: "selection-clear",
              historyDetail: `Reset selecție ${key}`,
            });
          }}
          onCommitSelection={(indices) => {
            const key = payload.programmeState?.selectionTargetKey;
            const ps = payload.programmeState;
            if (!key || !ps) {
              setErr("Alegeți mai întâi programul și rezultatul (GL1, GU1, …).");
              return;
            }
            if (indices.length < 2) {
              setErr(
                `Selecție insuficientă pentru ${key}: minim 2 puncte (acum ${indices.length}).`
              );
              return;
            }
            const active = activePoints(payload.workingPoints);
            let outsideStandardBand = false;
            let loopPointsExcluded = false;
            if (ps.programme === "A" && (/^GU\d+$/.test(key) || /^GR\d+$/.test(key))) {
              const band = checkProgrammeABand(
                key,
                active,
                indices,
                indices.map((i) => active[i])
              );
              outsideStandardBand = band.outside;
              if (outsideStandardBand && !selReason.trim()) {
                const msg =
                  band.message ||
                  `${key}: selecția iese din banda 30–70%. Completați câmpul „Motiv” din panoul Interpretare, sau restrângeți selecția între liniile 30% / 70% pe grafic.`;
                setErr(msg);
                window.alert(msg);
                return;
              }
            }
            if (ps.programme === "B" && /^GUR\d+$/.test(key)) {
              const seg = segmentPressureCurve(active);
              const covers = seg.loops.some(
                (l) =>
                  l.complete &&
                  selectionCoversLoop(indices, l.startIdx, l.endIdx)
              );
              const span = Math.max(...indices) - Math.min(...indices) + 1;
              loopPointsExcluded =
                !covers && (indices.length < span || indices.length < 6);
              if (loopPointsExcluded) {
                const choice = window.confirm(
                  "GURi pentru Programul B se calculează pe bucla completă de descărcare–reîncărcare. Selecția ta include doar o parte din buclă.\n\nOK = Continuă ca abatere (necesită motiv)\nCancel = Revizuiește selecția"
                );
                if (!choice) return;
                if (!selReason.trim()) {
                  setErr(
                    "Introduceți motivul pentru abaterea (subset buclă B) înainte de a continua."
                  );
                  return;
                }
              }
            }
            const ov = selectionToOverride({
              resultKey: key,
              activeIndices: indices,
              activePoints: active,
              reason: selReason.trim() || null,
              author: test.author,
              outsideStandardBand,
              loopPointsExcluded,
            });
            const rest = ps.fitOverrides.filter((o) => o.resultKey !== key);
            const next = {
              ...payload,
              programmeState: {
                ...ps,
                programmeConfirmed: true,
                chartAxisMode: ps.chartAxisMode ?? "p_R",
                chartTickSettings:
                  ps.chartTickSettings ?? defaultChartTickSettings(),
                fitOverrides: [...rest, ov],
              },
            };
            setSelectMode(false);
            setDraftIndices([]);
            setPayload(next);
            setErr(null);
            void save(next, {
              historyAction: "selection",
              historyDetail: `Selecție manuală ${key}: n=${indices.length}; CSV#[${ov.csvPointNumbers?.join(",") ?? ""}]`,
            });
          }}
        />
      </div>

      <div className="card w-full min-w-0 space-y-3 no-print">
        <h2 className="font-medium">Punct selectat</h2>
        {!selected && (
          <p className="text-sm text-muted">
            Click pe un punct din grafic (sau în tabelul de date) pentru a-l
            încărca aici. Dezactivați „Selectează pe grafic” dacă e activ —
            acel mod e pentru intervale de fit, nu pentru un singur punct.
          </p>
        )}
        {selected && (
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="text-sm">
              #{selected.index} · stare <strong>{selected.status}</strong>
              <br />
              p = {selected.pressureKPa.toFixed(1)} kPa · ΔV ={" "}
              {selected.volumeCm3.toFixed(2)} cm³
              {selected.radiusMm != null && (
                <> · R = {selected.radiusMm.toFixed(3)} mm</>
              )}
            </div>
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 md:grid-cols-4">
              <div className="field">
                <label>p (kPa)</label>
                <input value={editPressure} onChange={(e) => setEditPressure(e.target.value)} />
              </div>
              <div className="field">
                <label>ΔV (cm³)</label>
                <input value={editVolume} onChange={(e) => setEditVolume(e.target.value)} />
              </div>
              <div className="field md:col-span-2">
                <label>Motiv excludere</label>
                <input
                  value={excludeReason}
                  onChange={(e) => setExcludeReason(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn" onClick={applyEdit}>
                Aplică editare
              </button>
              {selected.status === "edited" && (
                <button type="button" className="btn" onClick={undoEdit}>
                  Anulează editarea
                </button>
              )}
              {selected.status !== "excluded" ? (
                <button type="button" className="btn btn-danger" onClick={excludeSelected}>
                  Exclude
                </button>
              ) : (
                <button type="button" className="btn" onClick={reinstateSelected}>
                  Reintrodu
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <ProbeConfigPanel
        payload={payload}
        onChange={(requiredInputs, interpretationPatch) => {
          const next = {
            ...payload,
            requiredInputs,
            interpretation: {
              ...payload.interpretation,
              ...interpretationPatch,
              apparatusLimitKPa:
                requiredInputs.apparatusLimitKPa ??
                interpretationPatch?.apparatusLimitKPa ??
                payload.interpretation.apparatusLimitKPa,
            },
          };
          setPayload(next);
          void save(next, {
            historyAction: "probe-config",
            historyDetail: interpretationPatch
              ? "Interpretare limită / rupere"
              : "Configurație sondă / limite presiune",
          });
        }}
      />

      <RequiredInputsForm
        payload={payload}
        onChange={(requiredInputs) => {
          const hasPs =
            requiredInputs.psCsvPointNumber != null ||
            requiredInputs.psManualKPa != null;
          const next = {
            ...payload,
            requiredInputs,
            interpretation: {
              ...payload.interpretation,
              apparatusLimitKPa:
                requiredInputs.apparatusLimitKPa ??
                payload.interpretation.apparatusLimitKPa,
              psKPa: hasPs
                ? (requiredInputs.psManualKPa ?? payload.interpretation.psKPa)
                : null,
              psOrigin: hasPs
                ? ("manual" as const)
                : ("unavailable" as const),
            },
            calibration: {
              ...payload.calibration,
              poisson: requiredInputs.poisson ?? payload.calibration.poisson,
            },
          };
          setPayload(next);
        }}
      />

      <CalibrationPanel
        testId={test.id}
        payload={payload}
        onUpdated={(p, warnings) => {
          setPayload(p);
          setMsg(warnings.slice(0, 3).join(" · ") || "Calibrare asociată.");
          startTransition(() => router.refresh());
        }}
      />

      <DerivedParamsPanel
        payload={payload}
        pending={pending}
        onChange={setPayload}
        onPersist={(next) => {
          void save(next, {
            historyAction: "derived-report",
            historyDetail: next.requiredInputs?.includeDerivedInReport
              ? "Parametri derivați incluși în raport"
              : "Parametri derivați excluși din raport",
          });
        }}
        onCompute={() => {
          let derivedSourceKeys =
            payload.requiredInputs?.derivedSourceKeys ?? [];
          const computeKWinkler =
            payload.requiredInputs?.computeKWinkler ?? false;
          // Pentru EPBP(GL1) folosit la k_W: include GL1 în bazele derivate
          if (computeKWinkler && !derivedSourceKeys.includes("GL1")) {
            const hasGl1 = (payload.results ?? []).some(
              (r) => r.key === "GL1" && r.value != null
            );
            if (hasGl1) derivedSourceKeys = [...derivedSourceKeys, "GL1"];
          }
          const ri = {
            ...defaultRequiredInputs(),
            ...(payload.requiredInputs ?? {}),
            computeEpbp:
              derivedSourceKeys.length > 0 || computeKWinkler,
            derivedSourceKeys,
            computeKWinkler,
          };
          const next = {
            ...payload,
            requiredInputs: ri,
            calibration: {
              ...payload.calibration,
              poisson: ri.poisson ?? payload.calibration.poisson,
            },
          };
          setPayload(next);
          void save(next, {
            historyAction: "derived",
            historyDetail: `Calcul derivați din [${ri.derivedSourceKeys.join(", ") || "—"}]${
              ri.computeKWinkler ? " + k_Winkler(GL1)" : ""
            }`,
          });
        }}
      />

      <div className="grid w-full min-w-0 items-stretch gap-4 lg:grid-cols-2">
        <div className="card overflow-auto">
          <h2 className="mb-2 font-medium">Rezultate (GPBP / program)</h2>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="py-1 pr-2">Parametru</th>
                <th className="py-1 pr-2">Valoare</th>
                <th className="py-1 pr-2">Formulă</th>
              </tr>
            </thead>
            <tbody>
              {payload.results
                .filter(
                  (r) =>
                    !/^(Kr|EPBP|Kb|E_plane_strain|M|mv|lambda)_/.test(r.key) &&
                    r.key !== "kWinkler_GL1" &&
                    r.key !== "EPBP_preview" &&
                    r.key !== "EPBP"
                )
                .map((r) => (
                <tr key={r.key} className="border-b border-line/60">
                  <td className="py-1.5 pr-2">
                    {r.label}
                    {r.note && (
                      <div className="text-xs text-muted">{r.note}</div>
                    )}
                  </td>
                  <td className="py-1.5 pr-2 font-medium">
                    {r.value == null
                      ? "—"
                      : r.key === "limitFlag"
                        ? "DA"
                        : `${r.value.toFixed(3)} ${r.unit}`}
                  </td>
                  <td className="py-1.5 text-xs text-muted">
                    {r.formula ?? "—"}
                    {r.variables ? (
                      <div>{r.variables}</div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {interp.apparatusLimitReachedWithoutRupture && (
            <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-sm text-[var(--warn)]">
              {interp.apparatusLimitNote ||
                "Limita practică a configurației atinsă; ruperea nu a fost observată. pMax nu este pL."}
            </p>
          )}
        </div>

        <div className="card flex h-full min-h-0 flex-col overflow-hidden no-print">
          <h2 className="mb-2 shrink-0 font-medium">Date (puncte de lucru)</h2>
          <p className="mb-2 shrink-0 text-xs text-muted">
            Brute: {payload.rawPoints.length} · Lucru: {payload.workingPoints.length} ·
            Active:{" "}
            {payload.workingPoints.filter((p) => p.status !== "excluded").length}
          </p>
          <div className="min-h-72 flex-1 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-panel">
                <tr className="border-b border-line text-muted">
                  <th className="py-1">#</th>
                  <th>p kPa</th>
                  <th>ΔV</th>
                  <th>R</th>
                  <th>Stare</th>
                </tr>
              </thead>
              <tbody>
                {payload.workingPoints.map((p) => (
                  <tr
                    key={p.id}
                    className={`cursor-pointer border-b border-line/50 ${
                      p.id === payload.selectedPointId ? "bg-accent-soft" : ""
                    } ${p.status === "excluded" ? "opacity-50 line-through" : ""}`}
                    onClick={() => onSelect(p.id)}
                  >
                    <td className="py-0.5">{p.index}</td>
                    <td>{p.pressureKPa.toFixed(1)}</td>
                    <td>{p.volumeCm3.toFixed(2)}</td>
                    <td>{p.radiusMm?.toFixed(2) ?? "—"}</td>
                    <td>{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {payload.importSummary && (
        <div className="card text-sm no-print">
          <div className="font-medium">Rezumat import</div>
          <ul className="mt-1 list-inside list-disc text-muted">
            <li>Fișier: {payload.importSummary.sourceFileName}</li>
            <li>Puncte valide: {payload.importSummary.pointsImported}</li>
            <li>
              Corecții pe export aparat:{" "}
              {payload.importSummary.correctionsAlreadyApplied
                ? "tratate ca aplicate de aparat (FlexiPMT nu reaplică)"
                : "nu"}
            </li>
            {payload.importSummary.warnings.slice(0, 6).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
            {payload.importSummary.unconvertedFields.length > 0 && (
              <li>
                Neimplementat: {payload.importSummary.unconvertedFields.join(", ")}
              </li>
            )}
          </ul>
        </div>
      )}

      <div className="card no-print">
        <h2 className="mb-2 font-medium">Istoric modificări</h2>
        <ul className="max-h-40 space-y-1 overflow-auto text-sm text-muted">
          {test.history.length === 0 && <li>Nicio înregistrare.</li>}
          {test.history.map((h, i) => (
            <li key={i}>
              <span className="text-ink">{h.at.slice(0, 19)}</span> — {h.action}
              {h.detail ? `: ${h.detail}` : ""}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
