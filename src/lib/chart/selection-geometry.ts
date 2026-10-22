/**
 * Conversie coordonate ecran ↔ date pentru selecția pe grafic.
 * Folosește dreptunghiul real al zonei de plot (ex. .recharts-cartesian-grid),
 * nu doar marginile Recharts — altfel YAxis width deplasează hit-test-ul.
 */

export type DataDomain = { x0: number; x1: number; y0: number; y1: number };

export type PlotRect = { left: number; top: number; width: number; height: number };

export type DataPoint2D = { x: number; y: number; activeIdx: number };

/** Convertește un punct client (viewport) în coordonate de date. */
export function clientToData(
  clientX: number,
  clientY: number,
  plot: PlotRect,
  domain: DataDomain
): { x: number; y: number } | null {
  if (plot.width <= 0 || plot.height <= 0) return null;
  const px = clientX - plot.left;
  const py = clientY - plot.top;
  const x = domain.x0 + (px / plot.width) * (domain.x1 - domain.x0);
  const y = domain.y1 - (py / plot.height) * (domain.y1 - domain.y0);
  return { x, y };
}

/** Puncte ale căror (x,y) cad în dreptunghiul de date (inclusiv pe margini). */
export function indicesInDataBox(
  points: DataPoint2D[],
  xLo: number,
  xHi: number,
  yLo: number,
  yHi: number
): number[] {
  const xa = Math.min(xLo, xHi);
  const xb = Math.max(xLo, xHi);
  const ya = Math.min(yLo, yHi);
  const yb = Math.max(yLo, yHi);
  return points
    .filter((p) => p.x >= xa && p.x <= xb && p.y >= ya && p.y <= yb)
    .map((p) => p.activeIdx);
}

/**
 * Cel mai apropiat punct în spațiu de date normalizat pe domeniu
 * (distanță euclidiană pe [0,1]×[0,1]), sau null dacă e prea departe.
 */
export function nearestActiveIndex(
  points: DataPoint2D[],
  dataX: number,
  dataY: number,
  domain: DataDomain,
  maxNormDist = 0.04
): number | null {
  const dx = domain.x1 - domain.x0 || 1;
  const dy = domain.y1 - domain.y0 || 1;
  let best: number | null = null;
  let bestD = Infinity;
  for (const p of points) {
    const nx = (p.x - dataX) / dx;
    const ny = (p.y - dataY) / dy;
    const d = nx * nx + ny * ny;
    if (d < bestD) {
      bestD = d;
      best = p.activeIdx;
    }
  }
  if (best == null || Math.sqrt(bestD) > maxNormDist) return null;
  return best;
}

export function toggleIndex(current: number[], idx: number): number[] {
  const set = new Set(current);
  if (set.has(idx)) set.delete(idx);
  else set.add(idx);
  return [...set].sort((a, b) => a - b);
}

export function mergeIndices(current: number[], add: number[]): number[] {
  return [...new Set([...current, ...add])].sort((a, b) => a - b);
}

export function rangeIndices(from: number, to: number): number[] {
  const a = Math.min(from, to);
  const b = Math.max(from, to);
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

/** Extrage ChartPt din argumentul onClick Recharts 3 (entry cu .payload). */
export function chartPayloadFromScatterArg(arg: unknown): {
  activeIdx: number;
  id: string;
} | null {
  if (!arg || typeof arg !== "object") return null;
  const obj = arg as Record<string, unknown>;
  const payload =
    obj.payload && typeof obj.payload === "object"
      ? (obj.payload as Record<string, unknown>)
      : obj;
  const activeIdx = payload.activeIdx;
  const id = payload.id;
  if (typeof activeIdx !== "number" || activeIdx < 0) return null;
  if (typeof id !== "string") return null;
  return { activeIdx, id };
}
