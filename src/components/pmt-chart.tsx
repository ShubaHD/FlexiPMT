"use client";

import {
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef,
  useLayoutEffect,
} from "react";
import {
  ComposedChart,
  Scatter,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ZAxis,
  ReferenceLine,
} from "recharts";
import type { WorkingPoint, ComputedResult } from "@/lib/schema/pmt-v1";
import type { FitIntervalOverride, ChartAxisMode } from "@/lib/calc/programme-types";
import { linRegSlope } from "@/lib/calc/iso-formulae";
import {
  activeIndicesFromCsvNumbers,
  resultKeyColor,
  resultKeyLabel,
} from "@/lib/calc/programme-moduli";
import {
  chartAxisLabel,
  chartAxisNote,
  chartXValue,
  CHART_AXIS_OPTIONS,
  geometricContactMarker,
} from "@/lib/chart/chart-axis";
import {
  defaultChartTickSettings,
  formatAxisTick,
  normalizeChartTickSettings,
  resolveAxisTicks,
  type ChartTickSettings,
} from "@/lib/chart/chart-ticks";
import {
  chartPayloadFromScatterArg,
  clientToData,
  indicesInDataBox,
  mergeIndices,
  nearestActiveIndex,
  rangeIndices,
  toggleIndex,
  type DataDomain,
  type PlotRect,
} from "@/lib/chart/selection-geometry";
import {
  reportT,
  type ReportLocale,
} from "@/lib/report/report-i18n";

type ChartPt = {
  id: string;
  x: number;
  y: number;
  index: number;
  activeIdx: number;
  status: string;
  pressureKPa: number;
  volumeCm3: number;
  radiusMm?: number | null;
  dRiMm?: number | null;
  inFit?: boolean;
  fit?: boolean;
};

type Props = {
  points: WorkingPoint[];
  selectedPointId: string | null;
  onSelect: (id: string | null) => void;
  psKPa?: number | null;
  apparatusLimitKPa?: number | null;
  heightPx?: number;
  fitOverrides?: FitIntervalOverride[];
  selectionTargetKey?: string | null;
  fitActiveIndices?: number[];
  fitResult?: ComputedResult | null;
  isoBandKPa?: { pLo: number; pHi: number } | null;
  selectMode?: boolean;
  onSelectModeChange?: (on: boolean) => void;
  selectionIndices?: number[];
  onSelectionIndicesChange?: (indices: number[]) => void;
  onCommitSelection?: (indices: number[]) => void;
  onCancelDraft?: () => void;
  onResetResultSelection?: () => void;
  chartAxisMode?: ChartAxisMode;
  onChartAxisModeChange?: (mode: ChartAxisMode) => void;
  chartTickSettings?: ChartTickSettings;
  onChartTickSettingsChange?: (settings: ChartTickSettings) => void;
  boreholeDiameterMm?: number | null;
  /** Ascunde controalele interactive (raport / print) */
  readOnly?: boolean;
  /** Limba etichetelor pe raport (RO/EN); implicit română */
  locale?: ReportLocale;
  /** Mod alegere punct de așezare ps pe grafic */
  psSelectMode?: boolean;
  onPsSelectModeChange?: (on: boolean) => void;
  psCsvPointNumber?: number | null;
  onPickPsPoint?: (csvNumber: number) => void;
};

type ZoomDomain = DataDomain;

const TICK_STYLE = { fontSize: 14, fill: "#1a2332" } as const;
const TICK_STYLE_COMPACT = { fontSize: 10, fill: "#1a2332" } as const;
const AXIS_LABEL_STYLE = { fontSize: 15, fill: "#1a2332", fontWeight: 600 } as const;
const REF_LABEL_SIZE = 11;
const REF_LABEL_SIZE_COMPACT = 9;
const DEFAULT_CHART_HEIGHT = 560;
const MARGIN = { top: 20, right: 28, bottom: 52, left: 20 };
/**
 * Compact (raport): spațiu jos în SVG pentru tick-uri X;
 * titlul „R (mm)” e HTML sub chenar (nu în Recharts).
 */
const MARGIN_COMPACT = { top: 6, right: 12, bottom: 28, left: 36 };
const DRAG_THRESHOLD_PX = 8;
const GRID_MAJOR = { stroke: "#c5d0db", strokeDasharray: "3 3" } as const;
const GRID_MINOR = { stroke: "#e8eef3", strokeDasharray: "2 5" } as const;
/** Dimensiune puncte Scatter (ZAxis); valori mici = curbă lizibilă */
const POINT_Z_NORMAL = 8;
const POINT_Z_EMPHASIS = 16;

function xAxisUnitHint(mode: ChartAxisMode): string {
  if (mode === "p_D") return "mm";
  if (mode === "p_dV") return "cm³";
  return "mm";
}

function preferredChartHeight(explicit?: number): number {
  if (explicit != null && explicit > 0) return explicit;
  if (typeof window === "undefined") return DEFAULT_CHART_HEIGHT;
  return Math.max(480, Math.min(720, Math.round(window.innerHeight * 0.68)));
}

function readPlotRect(host: HTMLElement): PlotRect | null {
  const grid = host.querySelector(
    ".recharts-cartesian-grid"
  ) as SVGGraphicsElement | null;
  if (grid && typeof grid.getBoundingClientRect === "function") {
    const r = grid.getBoundingClientRect();
    if (r.width > 4 && r.height > 4) {
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    }
  }
  const hostR = host.getBoundingClientRect();
  const leftPad = MARGIN.left + 72;
  const topPad = MARGIN.top;
  const rightPad = MARGIN.right;
  const bottomPad = MARGIN.bottom + 24;
  return {
    left: hostR.left + leftPad,
    top: hostR.top + topPad,
    width: Math.max(1, hostR.width - leftPad - rightPad),
    height: Math.max(1, hostR.height - topPad - bottomPad),
  };
}

function fitLineForPoints(pts: ChartPt[]): { x: number; y: number; fit: boolean }[] {
  if (pts.length < 2) return [];
  const slope = linRegSlope(
    pts.map((p) => p.x),
    pts.map((p) => p.y)
  );
  if (slope == null) return [];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const intercept = my - slope * mx;
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  return [
    { x: xMin, y: intercept + slope * xMin, fit: true },
    { x: xMax, y: intercept + slope * xMax, fit: true },
  ];
}

/**
 * Grafic presiometric: ordine CSV, selecție manuală pe overlay, axe p–R / p–D / p–ΔV.
 */
export function PmtChart({
  points,
  selectedPointId,
  onSelect,
  psKPa,
  apparatusLimitKPa,
  heightPx,
  fitOverrides = [],
  selectionTargetKey = null,
  fitActiveIndices = [],
  fitResult = null,
  isoBandKPa = null,
  selectMode = false,
  onSelectModeChange,
  selectionIndices,
  onSelectionIndicesChange,
  onCommitSelection,
  onCancelDraft,
  onResetResultSelection,
  chartAxisMode = "p_R",
  onChartAxisModeChange,
  chartTickSettings: chartTickSettingsProp,
  onChartTickSettingsChange,
  boreholeDiameterMm = null,
  readOnly = false,
  locale = "ro",
  psSelectMode = false,
  onPsSelectModeChange,
  psCsvPointNumber = null,
  onPickPsPoint,
}: Props) {
  const t = reportT(locale);
  const compact = readOnly;
  const tickStyle = compact ? TICK_STYLE_COMPACT : TICK_STYLE;
  const refLabelSize = compact ? REF_LABEL_SIZE_COMPACT : REF_LABEL_SIZE;
  const chartMargin = compact ? MARGIN_COMPACT : MARGIN;

  const tickSettings = useMemo(
    () =>
      normalizeChartTickSettings(
        chartTickSettingsProp ?? defaultChartTickSettings()
      ),
    [chartTickSettingsProp]
  );
  const [draftXStep, setDraftXStep] = useState(
    () =>
      tickSettings.x.majorStep != null ? String(tickSettings.x.majorStep) : ""
  );
  const [draftYStep, setDraftYStep] = useState(
    () =>
      tickSettings.y.majorStep != null ? String(tickSettings.y.majorStep) : ""
  );
  useEffect(() => {
    setDraftXStep(
      tickSettings.x.majorStep != null ? String(tickSettings.x.majorStep) : ""
    );
  }, [tickSettings.x.majorStep]);
  useEffect(() => {
    setDraftYStep(
      tickSettings.y.majorStep != null ? String(tickSettings.y.majorStep) : ""
    );
  }, [tickSettings.y.majorStep]);
  const hostRef = useRef<HTMLDivElement>(null);
  const [plotHeight, setPlotHeight] = useState(
    () => (heightPx != null && heightPx > 0 ? heightPx : DEFAULT_CHART_HEIGHT)
  );
  const [size, setSize] = useState({
    width: 0,
    height: heightPx != null && heightPx > 0 ? heightPx : DEFAULT_CHART_HEIGHT,
  });
  const [zoom, setZoom] = useState<ZoomDomain | null>(null);
  const [dragBox, setDragBox] = useState<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);
  const dragStart = useRef<{ clientX: number; clientY: number } | null>(null);
  const rangeAnchor = useRef<number | null>(null);
  const selectEnabled = Boolean(
    !readOnly && selectMode && selectionTargetKey && !psSelectMode
  );
  const psPickEnabled = Boolean(!readOnly && psSelectMode && !selectMode);

  const measure = useCallback(() => {
    const nextH = preferredChartHeight(heightPx);
    setPlotHeight((h) => (h === nextH ? h : nextH));
    const el = hostRef.current;
    if (!el) return;
    const width = Math.max(0, Math.floor(el.clientWidth));
    // Nu forța min 320 pe raport: cutia e mai mică și overflow taie scara X
    const minH = readOnly ? 120 : 320;
    const height = Math.max(
      minH,
      Math.floor(el.clientHeight) || nextH
    );
    setSize((prev) =>
      prev.width === width && prev.height === height ? prev : { width, height }
    );
  }, [heightPx, readOnly]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const width = Math.max(0, Math.floor(el.clientWidth));
    const minH = readOnly ? 120 : 320;
    const height = Math.max(
      minH,
      Math.floor(el.clientHeight) || plotHeight
    );
    setSize((prev) =>
      prev.width === width && prev.height === height ? prev : { width, height }
    );
  }, [plotHeight, readOnly]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    window.addEventListener("resize", measure);
    const t1 = window.setTimeout(measure, 50);
    const t2 = window.setTimeout(measure, 250);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [measure]);

  // Reset zoom la schimbarea axei (domeniu diferit)
  useEffect(() => {
    setZoom(null);
  }, [chartAxisMode]);

  const { ordered, excluded, extents, hasRadius } = useMemo(() => {
    const activeRaw = points
      .filter((p) => p.status !== "excluded")
      .slice()
      .sort((a, b) => a.index - b.index);

    const toPt = (p: WorkingPoint, activeIdx: number): ChartPt | null => {
      const x = chartXValue(p, chartAxisMode);
      if (x == null || !Number.isFinite(x)) return null;
      return {
        id: p.id,
        x,
        y: p.pressureKPa / 1000,
        index: p.index,
        activeIdx,
        status: p.status,
        pressureKPa: p.pressureKPa,
        volumeCm3: p.volumeCm3,
        radiusMm: p.radiusMm,
        dRiMm: p.dRiMm,
      };
    };

    const orderedPts: ChartPt[] = [];
    activeRaw.forEach((p, activeIdx) => {
      const pt = toPt(p, activeIdx);
      if (pt) orderedPts.push(pt);
    });

    const excl = points
      .filter((p) => p.status === "excluded")
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((p) => toPt(p, -1))
      .filter((p): p is ChartPt => p != null);

    const xs = [...orderedPts, ...excl].map((p) => p.x);
    const ys = [...orderedPts, ...excl].map((p) => p.y);
    // pe raport: padding mai strâns ca datele să umple cadrul
    const padFrac = readOnly ? 0.02 : 0.04;
    const padX =
      xs.length > 0 ? (Math.max(...xs) - Math.min(...xs)) * padFrac || 0.5 : 1;
    const padY =
      ys.length > 0 ? (Math.max(...ys) - Math.min(...ys)) * padFrac || 0.05 : 0.1;
    const nextExtents: ZoomDomain | null =
      xs.length > 0
        ? {
            x0: Math.min(...xs) - padX,
            x1: Math.max(...xs) + padX,
            y0: Math.min(...ys) - padY,
            y1: Math.max(...ys) + padY,
          }
        : null;

    const hasRadius = activeRaw.some(
      (p) => p.radiusMm != null && Number.isFinite(p.radiusMm)
    );

    return { ordered: orderedPts, excluded: excl, extents: nextExtents, hasRadius };
  }, [points, chartAxisMode, readOnly]);

  const activeList = useMemo(
    () =>
      points
        .filter((p) => p.status !== "excluded")
        .slice()
        .sort((a, b) => a.index - b.index),
    [points]
  );

  const draftSet = useMemo(
    () => new Set(selectionIndices ?? []),
    [selectionIndices]
  );
  const committedSet = useMemo(
    () => new Set(fitActiveIndices),
    [fitActiveIndices]
  );
  const highlightSet = selectMode ? draftSet : committedSet;

  const highlightedMarkers = useMemo(
    () => ordered.filter((p) => highlightSet.has(p.activeIdx)),
    [ordered, highlightSet]
  );

  const highlightSelected = useMemo(
    () => ordered.filter((p) => p.id === selectedPointId),
    [ordered, selectedPointId]
  );

  /** Serii salvate (toate override-urile) — vizibile când nu edităm draft */
  const savedSeries = useMemo(() => {
    return fitOverrides.map((ov, i) => {
      let idxs: number[] = [];
      if (ov.csvPointNumbers?.length) {
        idxs = activeIndicesFromCsvNumbers(activeList, ov.csvPointNumbers);
      } else if (ov.activeIndices?.length) {
        idxs = [...ov.activeIndices];
      }
      const pts = ordered.filter((p) => idxs.includes(p.activeIdx));
      const color = resultKeyColor(ov.resultKey, i);
      return {
        key: ov.resultKey,
        color,
        pts,
        line: fitLineForPoints(pts),
        label: resultKeyLabel(ov.resultKey),
        csv: ov.csvPointNumbers ?? pts.map((p) => p.index),
      };
    });
  }, [fitOverrides, activeList, ordered]);

  const draftFitLine = useMemo(
    () => fitLineForPoints(highlightedMarkers),
    [highlightedMarkers]
  );

  const domain = zoom ?? extents;
  const xDomain: [number, number] | ["auto", "auto"] = domain
    ? [domain.x0, domain.x1]
    : ["auto", "auto"];
  const yDomain: [number, number] | ["auto", "auto"] = domain
    ? [domain.y0, domain.y1]
    : ["auto", "auto"];

  const xTicks = useMemo(() => {
    if (!domain) return { major: [] as number[], minor: [] as number[], step: 1 };
    return resolveAxisTicks(domain.x0, domain.x1, tickSettings.x, {
      targetCount: 7,
    });
  }, [domain, tickSettings]);

  const yTicks = useMemo(() => {
    if (!domain) return { major: [] as number[], minor: [] as number[], step: 1 };
    return resolveAxisTicks(domain.y0, domain.y1, tickSettings.y, {
      targetCount: 8,
    });
  }, [domain, tickSettings]);

  const patchTickSettings = useCallback(
    (partial: {
      x?: Partial<ChartTickSettings["x"]>;
      y?: Partial<ChartTickSettings["y"]>;
    }) => {
      const next = normalizeChartTickSettings({
        x: { ...tickSettings.x, ...(partial.x ?? {}) },
        y: { ...tickSettings.y, ...(partial.y ?? {}) },
      });
      onChartTickSettingsChange?.(next);
    },
    [onChartTickSettingsChange, tickSettings]
  );

  const resetTickSettingsAuto = useCallback(() => {
    onChartTickSettingsChange?.(defaultChartTickSettings());
  }, [onChartTickSettingsChange]);

  const chartKey = `${points.length}:${size.width}x${size.height}:${chartAxisMode}:${points[0]?.id ?? ""}`;

  const resetZoom = useCallback(() => setZoom(null), []);
  const fitData = useCallback(() => {
    if (extents) setZoom({ ...extents });
  }, [extents]);
  const zoomBy = useCallback(
    (factor: number) => {
      const base = zoom ?? extents;
      if (!base) return;
      const cx = (base.x0 + base.x1) / 2;
      const cy = (base.y0 + base.y1) / 2;
      setZoom({
        x0: cx - ((base.x1 - base.x0) / 2) * factor,
        x1: cx + ((base.x1 - base.x0) / 2) * factor,
        y0: cy - ((base.y1 - base.y0) / 2) * factor,
        y1: cy + ((base.y1 - base.y0) / 2) * factor,
      });
    },
    [zoom, extents]
  );

  const updateSelection = useCallback(
    (next: number[]) => {
      onSelectionIndicesChange?.([...new Set(next)].sort((a, b) => a - b));
    },
    [onSelectionIndicesChange]
  );

  const handlePointClickBrowse = (arg: unknown) => {
    if (selectMode || psSelectMode || readOnly) return;
    const payload = chartPayloadFromScatterArg(arg);
    if (!payload) return;
    // Nu deselecta la re-click pe același punct — panoul „Punct selectat” rămâne umplut
    onSelect(payload.id);
  };

  /** Click scurt pe zonă (nu pe Scatter) → cel mai apropiat punct activ */
  const handleBrowseBackgroundClick = useCallback(
    (clientX: number, clientY: number) => {
      if (selectMode || psSelectMode || readOnly || !hostRef.current || !domain)
        return;
      const plot = readPlotRect(hostRef.current);
      if (!plot) return;
      const data = clientToData(clientX, clientY, plot, domain);
      if (!data) return;
      const idx = nearestActiveIndex(ordered, data.x, data.y, domain, 0.06);
      if (idx == null) return;
      const pt = ordered.find((p) => p.activeIdx === idx);
      if (pt) onSelect(pt.id);
    },
    [
      selectMode,
      psSelectMode,
      readOnly,
      domain,
      ordered,
      onSelect,
    ]
  );

  const finishPointerGesture = useCallback(
    (clientX: number, clientY: number, shiftKey: boolean) => {
      if (!hostRef.current || !domain || !dragStart.current) {
        dragStart.current = null;
        setDragBox(null);
        return;
      }
      const start = dragStart.current;
      const dx = Math.abs(clientX - start.clientX);
      const dy = Math.abs(clientY - start.clientY);
      const plot = readPlotRect(hostRef.current);
      if (!plot) {
        dragStart.current = null;
        setDragBox(null);
        return;
      }

      // Alegere punct ps — click scurt
      if (psPickEnabled) {
        if (dx <= DRAG_THRESHOLD_PX && dy <= DRAG_THRESHOLD_PX) {
          const data = clientToData(clientX, clientY, plot, domain);
          if (data) {
            const idx = nearestActiveIndex(ordered, data.x, data.y, domain);
            if (idx != null) {
              const pt = ordered.find((p) => p.activeIdx === idx);
              if (pt) onPickPsPoint?.(pt.index);
            }
          }
        }
        dragStart.current = null;
        setDragBox(null);
        return;
      }

      if (!selectEnabled) {
        dragStart.current = null;
        setDragBox(null);
        return;
      }
      const current = selectionIndices ?? [];
      if (dx > DRAG_THRESHOLD_PX || dy > DRAG_THRESHOLD_PX) {
        const d0 = clientToData(start.clientX, start.clientY, plot, domain);
        const d1 = clientToData(clientX, clientY, plot, domain);
        if (d0 && d1) {
          const hit = indicesInDataBox(ordered, d0.x, d1.x, d0.y, d1.y);
          if (hit.length) updateSelection(mergeIndices(current, hit));
        }
      } else {
        const data = clientToData(clientX, clientY, plot, domain);
        if (data) {
          const idx = nearestActiveIndex(ordered, data.x, data.y, domain);
          if (idx != null) {
            if (shiftKey && rangeAnchor.current != null) {
              updateSelection(
                mergeIndices(current, rangeIndices(rangeAnchor.current, idx))
              );
            } else {
              rangeAnchor.current = idx;
              updateSelection(toggleIndex(current, idx));
            }
          }
        }
      }
      dragStart.current = null;
      setDragBox(null);
    },
    [
      selectEnabled,
      psPickEnabled,
      domain,
      ordered,
      selectionIndices,
      updateSelection,
      onPickPsPoint,
    ]
  );

  const onOverlayPointerDown = (e: React.PointerEvent) => {
    if (!selectEnabled && !psPickEnabled) return;
    e.preventDefault();
    dragStart.current = { clientX: e.clientX, clientY: e.clientY };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const host = hostRef.current;
    if (!host) return;
    const r = host.getBoundingClientRect();
    setDragBox({
      x0: e.clientX - r.left,
      y0: e.clientY - r.top,
      x1: e.clientX - r.left,
      y1: e.clientY - r.top,
    });
  };

  const onOverlayPointerMove = (e: React.PointerEvent) => {
    if (!dragStart.current || !hostRef.current) return;
    const r = hostRef.current.getBoundingClientRect();
    setDragBox({
      x0: dragStart.current.clientX - r.left,
      y0: dragStart.current.clientY - r.top,
      x1: e.clientX - r.left,
      y1: e.clientY - r.top,
    });
  };

  const onOverlayPointerUp = (e: React.PointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    finishPointerGesture(e.clientX, e.clientY, e.shiftKey);
  };

  const draftCount = selectionIndices?.length ?? 0;
  const canApply = selectEnabled && draftCount >= 2;
  const contact = geometricContactMarker(
    chartAxisMode,
    boreholeDiameterMm,
    hasRadius
  );

  const showSavedOverlays = !selectMode && savedSeries.length > 0;
  const showDraftFit = selectMode && draftFitLine.length === 2;

  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      {!readOnly && (
        <div className="flex flex-wrap items-end gap-3 no-print">
          <div className="field min-w-[12rem]">
            <label>Reprezentare grafic</label>
            <select
              value={chartAxisMode}
              onChange={(e) =>
                onChartAxisModeChange?.(e.target.value as ChartAxisMode)
              }
            >
              {CHART_AXIS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <p className="max-w-xl text-xs text-muted">{chartAxisNote(chartAxisMode)}</p>
        </div>
      )}

      {!readOnly && (
        <div className="flex flex-wrap items-end gap-3 rounded border border-line bg-accent-soft/20 px-3 py-2 no-print">
          <div className="field min-w-[9rem]">
            <label>Gradații X ({xAxisUnitHint(chartAxisMode)})</label>
            <select
              value={tickSettings.x.mode}
              onChange={(e) => {
                const mode = e.target.value as "auto" | "custom";
                patchTickSettings({
                  x: {
                    mode,
                    majorStep:
                      mode === "custom"
                        ? tickSettings.x.majorStep ?? xTicks.step
                        : tickSettings.x.majorStep,
                  },
                });
              }}
            >
              <option value="auto">Automat</option>
              <option value="custom">Personalizat</option>
            </select>
          </div>
          {tickSettings.x.mode === "custom" && (
            <div className="field min-w-[7rem]">
              <label>Pas major X</label>
              <input
                type="number"
                step="any"
                min={0}
                placeholder={String(xTicks.step)}
                value={draftXStep}
                onChange={(e) => setDraftXStep(e.target.value)}
                onBlur={() => {
                  const v = Number(draftXStep.replace(",", "."));
                  if (Number.isFinite(v) && v > 0) {
                    patchTickSettings({
                      x: { mode: "custom", majorStep: v },
                    });
                  } else {
                    setDraftXStep(
                      tickSettings.x.majorStep != null
                        ? String(tickSettings.x.majorStep)
                        : String(xTicks.step)
                    );
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
              />
            </div>
          )}
          <div className="field min-w-[9rem]">
            <label>Gradații Y (MPa)</label>
            <select
              value={tickSettings.y.mode}
              onChange={(e) => {
                const mode = e.target.value as "auto" | "custom";
                patchTickSettings({
                  y: {
                    mode,
                    majorStep:
                      mode === "custom"
                        ? tickSettings.y.majorStep ?? yTicks.step
                        : tickSettings.y.majorStep,
                  },
                });
              }}
            >
              <option value="auto">Automat</option>
              <option value="custom">Personalizat</option>
            </select>
          </div>
          {tickSettings.y.mode === "custom" && (
            <div className="field min-w-[7rem]">
              <label>Pas major Y</label>
              <input
                type="number"
                step="any"
                min={0}
                placeholder={String(yTicks.step)}
                value={draftYStep}
                onChange={(e) => setDraftYStep(e.target.value)}
                onBlur={() => {
                  const v = Number(draftYStep.replace(",", "."));
                  if (Number.isFinite(v) && v > 0) {
                    patchTickSettings({
                      y: { mode: "custom", majorStep: v },
                    });
                  } else {
                    setDraftYStep(
                      tickSettings.y.majorStep != null
                        ? String(tickSettings.y.majorStep)
                        : String(yTicks.step)
                    );
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
              />
            </div>
          )}
          <button
            type="button"
            className="btn text-sm"
            onClick={resetTickSettingsAuto}
            title="Revine la gradații automate pe ambele axe"
          >
            Scară automată
          </button>
          <p className="max-w-md text-xs text-muted">
            Grilă secundară fără etichete. Setările se păstrează la schimbarea
            reprezentării și la redeschiderea testului.
          </p>
        </div>
      )}

      {(readOnly ? savedSeries.length > 0 : true) && (
        <div
          className={`flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted ${
            readOnly ? "report-chart-legend" : "no-print"
          }`}
        >
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-4"
              style={{ background: "var(--active)" }}
            />
            {compact ? t.chartCurve : "Curbă (ordine CSV Number)"}
          </span>
          {!readOnly && (
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ background: "var(--active)" }}
              />
              Active pe curbă ({ordered.length})
            </span>
          )}
          {!readOnly && (
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ background: "#c45c26" }}
              />
              {selectMode
                ? `Draft selecție (${draftCount})`
                : `În calcul țintă (${highlightedMarkers.length})`}
            </span>
          )}
          {savedSeries.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ background: s.color }}
              />
              {s.key} (n={s.pts.length})
            </span>
          ))}
          {readOnly && psKPa != null && Number.isFinite(psKPa) && (
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-0.5 w-4"
                style={{ background: "#2a6f4e" }}
              />
              {t.chartPs}
              {psCsvPointNumber != null ? ` #${psCsvPointNumber}` : ""}
            </span>
          )}
          {!readOnly && (
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              type="button"
              className={`btn text-sm ${psSelectMode ? "btn-primary" : ""}`}
              disabled={selectMode}
              onClick={() => {
                onPsSelectModeChange?.(!psSelectMode);
                if (!psSelectMode) onSelectModeChange?.(false);
              }}
            >
              {psSelectMode ? "Alegere ps: ON" : "Selectează punct ps"}
            </button>
            <button
              type="button"
              className={`btn text-sm ${selectMode ? "btn-primary" : ""}`}
              disabled={!selectionTargetKey || psSelectMode}
              title={
                selectionTargetKey
                  ? undefined
                  : "Alegeți programul și rezultatul în panoul Interpretare pe program"
              }
              onClick={() => {
                onSelectModeChange?.(!selectMode);
                if (!selectMode) onPsSelectModeChange?.(false);
              }}
            >
              {selectMode ? "Mod selecție: ON" : "Selectează puncte"}
            </button>
            {selectMode && (
              <>
                <button
                  type="button"
                  className="btn btn-primary text-sm"
                  onClick={() => onCommitSelection?.(selectionIndices ?? [])}
                  disabled={!canApply}
                >
                  Aplică{selectionTargetKey ? ` la ${selectionTargetKey}` : ""}
                </button>
                <button
                  type="button"
                  className="btn text-sm"
                  onClick={() => {
                    updateSelection([]);
                    onCancelDraft?.();
                  }}
                >
                  Anulează draft
                </button>
                <button
                  type="button"
                  className="btn text-sm"
                  onClick={() => {
                    updateSelection([]);
                    onResetResultSelection?.();
                    onSelectModeChange?.(false);
                  }}
                >
                  Resetează rezultatul
                </button>
              </>
            )}
            <button
              type="button"
              className="btn text-sm"
              onClick={() => zoomBy(0.7)}
              disabled={selectMode || psSelectMode}
            >
              Zoom +
            </button>
            <button
              type="button"
              className="btn text-sm"
              onClick={() => zoomBy(1.4)}
              disabled={selectMode || psSelectMode}
            >
              Zoom −
            </button>
            <button
              type="button"
              className="btn text-sm"
              onClick={fitData}
              disabled={selectMode || psSelectMode}
            >
              Încadrare date
            </button>
            <button
              type="button"
              className="btn text-sm"
              onClick={resetZoom}
              disabled={selectMode || psSelectMode}
            >
              Resetează zoom
            </button>
          </div>
          )}
        </div>
      )}

      {!readOnly && !selectionTargetKey && (
        <p className="rounded border border-line bg-accent-soft/30 px-3 py-2 text-sm no-print">
          Pentru a selecta puncte, alegeți <strong>programul</strong> și{" "}
          <strong>rezultatul</strong> în panoul „Interpretare pe program”.
        </p>
      )}

      {!readOnly && psSelectMode && (
        <p className="rounded border-2 border-accent bg-accent-soft/40 px-3 py-2 text-sm no-print">
          Selectați pe grafic punctul de <strong>așezare (ps)</strong>. Se salvează
          Number-ul CSV și presiunea punctului. ps nu se identifică automat fără
          confirmarea dumneavoastră.
          {psCsvPointNumber != null && (
            <>
              {" "}
              Curent: CSV #{psCsvPointNumber}.
            </>
          )}
        </p>
      )}

      {!readOnly && selectMode && selectionTargetKey && (
        <p className="rounded border-2 border-accent bg-accent-soft/40 px-3 py-2 text-sm no-print">
          Mod selecție activ pentru <strong>{selectionTargetKey}</strong>: trageți
          un dreptunghi sau apăsați pe un punct (Shift+click = interval pe Number
          CSV). Selecția folosește identificatorii CSV. Zoom dezactivat.
        </p>
      )}

      {contact &&
        "missing" in contact &&
        chartAxisMode !== "p_dV" &&
        !compact && (
          <p className="text-xs text-muted">{contact.missing}</p>
        )}

      {fitResult && !selectMode && (
        <div className="rounded border border-line bg-accent-soft/40 px-3 py-2 text-sm">
          <strong>{fitResult.key}</strong>
          {" · "}
          n={fitResult.usedActiveIndices?.length ?? highlightedMarkers.length}
          {fitResult.slope != null && (
            <> · pantă={fitResult.slope.toExponential(3)}</>
          )}
          {fitResult.value != null && (
            <>
              {" "}
              · {fitResult.key}={fitResult.value.toPrecision(3)} {fitResult.unit}
            </>
          )}
          <div className="text-xs text-muted">{fitResult.formula}</div>
          <div className="text-xs text-muted">{fitResult.dataInterval}</div>
        </div>
      )}

      {selectMode && draftCount > 0 && draftCount < 2 && (
        <p className="text-sm text-[var(--warn)] no-print">
          Selectați cel puțin 2 puncte pentru {selectionTargetKey}.
        </p>
      )}

      <div
        className={
          compact
            ? "relative mb-1 flex min-w-0 flex-col gap-1"
            : "contents"
        }
      >
        <div
          className={
            compact
              ? "relative flex min-w-0 items-stretch gap-0.5"
              : "contents"
          }
        >
        {compact && (
          <div
            className="flex w-4 shrink-0 items-center justify-center self-stretch"
            aria-hidden
          >
            <span
              className="whitespace-nowrap text-[0.7rem] font-semibold text-ink"
              style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
            >
              p (MPa)
            </span>
          </div>
        )}
      <div
        ref={hostRef}
        className={`pmt-chart relative w-full min-w-0 overflow-hidden rounded border bg-white ${
          selectEnabled || psPickEnabled
            ? "border-2 border-accent ring-2 ring-accent/30"
            : "border-line"
        }`}
        style={{
          width: "100%",
          height: plotHeight,
          minHeight: readOnly ? heightPx ?? 280 : 320,
          touchAction: selectEnabled || psPickEnabled ? "none" : "auto",
        }}
        onClick={(e) => {
          // Fallback: click pe zonă / overlay fără handler → cel mai apropiat punct
          if (selectEnabled || psPickEnabled || readOnly) return;
          handleBrowseBackgroundClick(e.clientX, e.clientY);
        }}
      >
        {dragBox && selectEnabled && (
          <div
            className="pointer-events-none absolute z-20 border-2 border-accent bg-accent/15"
            style={{
              left: Math.min(dragBox.x0, dragBox.x1),
              top: Math.min(dragBox.y0, dragBox.y1),
              width: Math.abs(dragBox.x1 - dragBox.x0),
              height: Math.abs(dragBox.y1 - dragBox.y0),
            }}
          />
        )}
        {(selectEnabled || psPickEnabled) && (
          <div
            className="absolute inset-0 z-10 cursor-crosshair"
            style={{ touchAction: "none" }}
            onPointerDown={onOverlayPointerDown}
            onPointerMove={onOverlayPointerMove}
            onPointerUp={onOverlayPointerUp}
            onPointerCancel={() => {
              dragStart.current = null;
              setDragBox(null);
            }}
            role="presentation"
          />
        )}
        {size.width > 40 ? (
          <ComposedChart
            key={chartKey}
            width={size.width}
            height={size.height}
            margin={chartMargin}
          >
            {(xTicks.minor.length > 0 || yTicks.minor.length > 0) && (
              <CartesianGrid
                vertical={xTicks.minor.length > 0}
                horizontal={yTicks.minor.length > 0}
                verticalValues={xTicks.minor}
                horizontalValues={yTicks.minor}
                stroke={GRID_MINOR.stroke}
                strokeDasharray={GRID_MINOR.strokeDasharray}
              />
            )}
            <CartesianGrid
              vertical={xTicks.major.length > 0}
              horizontal={yTicks.major.length > 0}
              verticalValues={
                xTicks.major.length > 0 ? xTicks.major : undefined
              }
              horizontalValues={
                yTicks.major.length > 0 ? yTicks.major : undefined
              }
              stroke={GRID_MAJOR.stroke}
              strokeDasharray={GRID_MAJOR.strokeDasharray}
            />
            <XAxis
              type="number"
              dataKey="x"
              name={chartAxisLabel(chartAxisMode)}
              domain={xDomain}
              allowDataOverflow
              ticks={xTicks.major.length > 0 ? xTicks.major : undefined}
              tick={tickStyle}
              tickFormatter={(v: number) => formatAxisTick(v, xTicks.step)}
              tickMargin={compact ? 6 : 8}
              minTickGap={compact ? 16 : 28}
              interval="preserveStartEnd"
              height={compact ? 26 : 48}
              label={
                compact
                  ? undefined
                  : {
                      value: chartAxisLabel(chartAxisMode),
                      position: "bottom",
                      offset: 8,
                      style: AXIS_LABEL_STYLE,
                    }
              }
            />
            <YAxis
              type="number"
              dataKey="y"
              name="p"
              domain={yDomain}
              allowDataOverflow
              ticks={yTicks.major.length > 0 ? yTicks.major : undefined}
              tick={tickStyle}
              tickFormatter={(v: number) => formatAxisTick(v, yTicks.step)}
              tickMargin={compact ? 4 : 10}
              minTickGap={compact ? 12 : 18}
              interval="preserveStartEnd"
              width={compact ? 36 : 72}
              label={
                compact
                  ? undefined
                  : {
                      value: "p (MPa)",
                      angle: -90,
                      position: "insideLeft",
                      offset: 4,
                      style: AXIS_LABEL_STYLE,
                    }
              }
            />
            <ZAxis
              dataKey="z"
              range={[POINT_Z_NORMAL, POINT_Z_EMPHASIS]}
              type="number"
            />
            {!selectEnabled && (
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                content={({ active: tipActive, payload }) => {
                  if (!tipActive || !payload?.[0]) return null;
                  const d = payload[0].payload as ChartPt;
                  if (d.fit) return null;
                  return (
                    <div className="rounded border border-line bg-white px-3 py-2 text-sm shadow-md">
                      <div className="font-medium">CSV Number #{d.index}</div>
                      <div>p = {d.pressureKPa.toFixed(1)} kPa</div>
                      {d.radiusMm != null && (
                        <div>
                          R = {d.radiusMm.toFixed(2)} mm · D ={" "}
                          {(2 * d.radiusMm).toFixed(2)} mm
                        </div>
                      )}
                      <div>ΔV FlexiPMT = {d.volumeCm3.toFixed(2)} cm³</div>
                      {d.inFit && (
                        <div className="font-medium text-accent">Inclus în calcul</div>
                      )}
                    </div>
                  );
                }}
              />
            )}

            {isoBandKPa && (
              <>
                <ReferenceLine
                  y={isoBandKPa.pLo / 1000}
                  stroke="#8a5a10"
                  strokeDasharray="2 4"
                  label={{
                    value: "30%",
                    fontSize: refLabelSize,
                    fill: "#8a5a10",
                  }}
                />
                <ReferenceLine
                  y={isoBandKPa.pHi / 1000}
                  stroke="#8a5a10"
                  strokeDasharray="2 4"
                  label={{
                    value: "70%",
                    fontSize: refLabelSize,
                    fill: "#8a5a10",
                  }}
                />
              </>
            )}

            {contact && "x" in contact && (
              <ReferenceLine
                x={contact.x}
                stroke="#5b6b7c"
                strokeDasharray="4 3"
                label={{
                  value: compact ? t.chartContact : "contact geom.",
                  position: compact ? "insideTopLeft" : "top",
                  fontSize: refLabelSize,
                  fill: "#5b6b7c",
                }}
              />
            )}

            {psKPa != null && Number.isFinite(psKPa) && (
              <ReferenceLine
                y={psKPa / 1000}
                stroke="#0f4c6e"
                strokeWidth={2}
                strokeDasharray="4 4"
                label={{
                  value:
                    psCsvPointNumber != null
                      ? `${t.chartPs} #${psCsvPointNumber}`
                      : t.chartPs,
                  position: compact ? "insideTopRight" : "right",
                  fontSize: refLabelSize,
                  fill: "#0f4c6e",
                }}
              />
            )}
            {apparatusLimitKPa != null && Number.isFinite(apparatusLimitKPa) && (
              <ReferenceLine
                y={apparatusLimitKPa / 1000}
                stroke="#8b2e2e"
                strokeDasharray="2 2"
                label={{
                  value: compact ? t.chartLimit : "lim. practică",
                  position: compact ? "insideBottomRight" : "right",
                  fontSize: refLabelSize,
                  fill: "#8b2e2e",
                }}
              />
            )}

            <Line
              data={ordered}
              type="linear"
              dataKey="y"
              stroke="var(--active)"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              name="curbă"
              connectNulls={false}
            />

            {showSavedOverlays &&
              savedSeries.map((s) =>
                s.line.length === 2 ? (
                  <Line
                    key={`fit-${s.key}`}
                    data={s.line}
                    type="linear"
                    dataKey="y"
                    stroke={s.color}
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    dot={false}
                    isAnimationActive={false}
                    name={`fit ${s.key}`}
                  />
                ) : null
              )}

            {showDraftFit && (
              <Line
                data={draftFitLine}
                type="linear"
                dataKey="y"
                stroke="#8b2e2e"
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                isAnimationActive={false}
                name="fit draft"
              />
            )}

            <Scatter
              name="excluse"
              data={excluded.map((p) => ({ ...p, z: POINT_Z_NORMAL }))}
              fill="var(--excluded)"
              fillOpacity={0.45}
              shape="cross"
              isAnimationActive={false}
            />
            <Scatter
              name="active"
              data={ordered
                .filter((p) => !(selectMode && highlightSet.has(p.activeIdx)))
                .map((p) => ({ ...p, z: POINT_Z_NORMAL }))}
              fill="var(--active)"
              isAnimationActive={false}
              cursor={readOnly || selectMode ? undefined : "pointer"}
              onClick={handlePointClickBrowse}
            />
            {showSavedOverlays &&
              savedSeries.map((s) => (
                <Scatter
                  key={`sel-${s.key}`}
                  name={s.key}
                  data={s.pts.map((p) => ({
                    ...p,
                    z: readOnly ? POINT_Z_NORMAL : POINT_Z_EMPHASIS * 0.7,
                  }))}
                  fill={s.color}
                  isAnimationActive={false}
                  cursor={readOnly ? undefined : "pointer"}
                  onClick={handlePointClickBrowse}
                />
              ))}
            {(selectMode ||
              (!showSavedOverlays && highlightedMarkers.length > 0)) && (
              <Scatter
                name="în calcul / draft"
                data={highlightedMarkers.map((p) => ({
                  ...p,
                  z: POINT_Z_EMPHASIS,
                }))}
                fill="#c45c26"
                isAnimationActive={false}
                cursor={readOnly || selectMode ? undefined : "pointer"}
                onClick={handlePointClickBrowse}
              />
            )}
            {psCsvPointNumber != null && (
              <Scatter
                name="punct ps"
                data={ordered
                  .filter((p) => p.index === psCsvPointNumber)
                  .map((p) => ({ ...p, z: POINT_Z_EMPHASIS }))}
                fill="#0f4c6e"
                shape="diamond"
                isAnimationActive={false}
                cursor={readOnly || selectMode ? undefined : "pointer"}
                onClick={handlePointClickBrowse}
              />
            )}
            {!selectMode && !psSelectMode && !readOnly && (
              <Scatter
                name="punct UI"
                data={highlightSelected.map((p) => ({
                  ...p,
                  z: POINT_Z_EMPHASIS,
                }))}
                fill="#0f4c6e"
                isAnimationActive={false}
                cursor="pointer"
                onClick={handlePointClickBrowse}
              />
            )}
          </ComposedChart>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            {compact ? t.chartLoading : "Se încarcă graficul…"}
          </div>
        )}
      </div>
        </div>
        {compact && (
          <div className="-mt-0.5 pl-5 text-center text-[0.7rem] font-semibold leading-none text-ink">
            {chartAxisLabel(chartAxisMode)}
          </div>
        )}
      </div>
      {!compact && (
        <p className="text-xs text-muted">
          Punctele sunt unite în ordinea Number din CSV. Selecțiile salvate
          folosesc identificatorii CSV și apar pe toate reprezentările p–R /
          p–D / p–ΔV.
          {fitOverrides.length > 0 &&
            ` · ${fitOverrides.length} selecție/selecții în interpretare.`}
        </p>
      )}
    </div>
  );
}
