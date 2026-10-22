/**
 * Gradații majore / secundare pentru axele graficului p–R / p–D / p–ΔV.
 * Nu afectează datele, selecțiile sau calculele — doar afișarea.
 */

export type AxisTickMode = "auto" | "custom";

export type AxisTickSettings = {
  mode: AxisTickMode;
  /** Pas major în unitățile axei (mm, MPa, cm³). Folosit doar în modul custom. */
  majorStep: number | null;
};

export type ChartTickSettings = {
  x: AxisTickSettings;
  y: AxisTickSettings;
};

export type ResolvedAxisTicks = {
  major: number[];
  /** Linii de grilă secundare (fără etichete pe axă) */
  minor: number[];
  /** Pasul major efectiv folosit */
  step: number;
};

const DEFAULT_MINOR_DIVISIONS = 5;
const DEFAULT_TARGET_MAJORS = 7;
/** Prag doar pentru pași extrem de fini; etichetele se rarefiază via minTickGap. */
const MAX_MAJOR_TICKS = 40;

export function defaultAxisTickSettings(): AxisTickSettings {
  return { mode: "auto", majorStep: null };
}

export function defaultChartTickSettings(): ChartTickSettings {
  return {
    x: defaultAxisTickSettings(),
    y: defaultAxisTickSettings(),
  };
}

export function normalizeChartTickSettings(
  raw?: Partial<ChartTickSettings> | null
): ChartTickSettings {
  const d = defaultChartTickSettings();
  if (!raw || typeof raw !== "object") return d;
  return {
    x: {
      mode: raw.x?.mode === "custom" ? "custom" : "auto",
      majorStep:
        raw.x?.majorStep != null &&
        Number.isFinite(raw.x.majorStep) &&
        raw.x.majorStep > 0
          ? raw.x.majorStep
          : null,
    },
    y: {
      mode: raw.y?.mode === "custom" ? "custom" : "auto",
      majorStep:
        raw.y?.majorStep != null &&
        Number.isFinite(raw.y.majorStep) &&
        raw.y.majorStep > 0
          ? raw.y.majorStep
          : null,
    },
  };
}

/** Pas „frumos” (1 / 2 / 5 × 10^n). */
export function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const exp = Math.floor(Math.log10(raw));
  const base = Math.pow(10, exp);
  const mant = raw / base;
  let niceMant: number;
  if (mant <= 1) niceMant = 1;
  else if (mant <= 2) niceMant = 2;
  else if (mant <= 5) niceMant = 5;
  else niceMant = 10;
  return niceMant * base;
}

export function autoMajorStep(
  min: number,
  max: number,
  targetCount = DEFAULT_TARGET_MAJORS
): number {
  const span = Math.abs(max - min);
  if (!(span > 0) || !Number.isFinite(span)) return 1;
  const target = Math.max(3, targetCount);
  return niceStep(span / (target - 1));
}

function roundToStep(value: number, step: number): number {
  const decimals = Math.max(0, Math.ceil(-Math.log10(step)) + 2);
  const f = Math.pow(10, Math.min(12, decimals));
  return Math.round(value * f) / f;
}

/** Generează tick-uri majore pe [min, max] inclusiv, aliniate la pas. */
export function ticksFromStep(
  min: number,
  max: number,
  step: number
): number[] {
  if (!(step > 0) || !Number.isFinite(step) || !Number.isFinite(min) || !Number.isFinite(max)) {
    return [];
  }
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const startIdx = Math.ceil(lo / step - 1e-12);
  const endIdx = Math.floor(hi / step + 1e-12);
  const out: number[] = [];
  const limit = MAX_MAJOR_TICKS * 4;
  for (let i = startIdx, n = 0; i <= endIdx && n < limit; i++, n++) {
    out.push(roundToStep(i * step, step));
  }
  return out;
}

/**
 * Dacă pasul custom ar produce prea multe etichete, mărește pasul
 * (grila rămâne lizibilă; valorile datelor nu se schimbă).
 */
export function clampMajorStep(
  min: number,
  max: number,
  step: number,
  maxTicks = MAX_MAJOR_TICKS
): number {
  if (!(step > 0)) return autoMajorStep(min, max);
  const span = Math.abs(max - min);
  if (!(span > 0)) return step;
  const approx = Math.floor(span / step) + 1;
  if (approx <= maxTicks) return step;
  return niceStep(span / (maxTicks - 1));
}

/** Tick-uri secundare între majori consecutivi (fără etichete). */
export function minorTicksBetween(
  majors: number[],
  majorStep: number,
  divisions = DEFAULT_MINOR_DIVISIONS,
  domainLo?: number,
  domainHi?: number
): number[] {
  if (majors.length < 2 || !(majorStep > 0) || divisions < 2) return [];
  const minorStep = majorStep / divisions;
  const out: number[] = [];
  for (let i = 0; i < majors.length - 1; i++) {
    const a = majors[i]!;
    for (let k = 1; k < divisions; k++) {
      const t = roundToStep(a + k * minorStep, minorStep);
      if (domainLo != null && t < domainLo - minorStep * 1e-9) continue;
      if (domainHi != null && t > domainHi + minorStep * 1e-9) continue;
      out.push(t);
    }
  }
  return out;
}

/** Zecimale potrivite pasului (ex. 0.1 → 1 zecimală, 0.05 → 2). */
export function tickDecimalPlaces(step: number): number {
  if (!(step > 0) || !Number.isFinite(step)) return 2;
  if (step >= 10) return 0;
  if (step >= 1) return 1;
  const places = Math.ceil(-Math.log10(step));
  return Math.max(0, Math.min(6, places));
}

export function formatAxisTick(value: number, step: number): string {
  if (!Number.isFinite(value)) return "";
  const places = tickDecimalPlaces(step);
  return value.toFixed(places);
}

export function resolveAxisTicks(
  min: number,
  max: number,
  settings: AxisTickSettings,
  opts?: {
    targetCount?: number;
    minorDivisions?: number;
    maxMajorTicks?: number;
  }
): ResolvedAxisTicks {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const divisions = opts?.minorDivisions ?? DEFAULT_MINOR_DIVISIONS;
  const maxMajors = opts?.maxMajorTicks ?? MAX_MAJOR_TICKS;

  let step: number;
  if (
    settings.mode === "custom" &&
    settings.majorStep != null &&
    settings.majorStep > 0
  ) {
    step = clampMajorStep(lo, hi, settings.majorStep, maxMajors);
  } else {
    step = autoMajorStep(lo, hi, opts?.targetCount ?? DEFAULT_TARGET_MAJORS);
  }

  const major = ticksFromStep(lo, hi, step);
  const minor = minorTicksBetween(major, step, divisions, lo, hi);

  return { major, minor, step };
}
