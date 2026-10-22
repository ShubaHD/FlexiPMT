import { describe, expect, it } from "vitest";
import {
  chartPayloadFromScatterArg,
  clientToData,
  indicesInDataBox,
  mergeIndices,
  nearestActiveIndex,
  rangeIndices,
  toggleIndex,
} from "@/lib/chart/selection-geometry";

const domain = { x0: 0, x1: 100, y0: 0, y1: 10 };
const plot = { left: 100, top: 50, width: 400, height: 200 };

describe("selection-geometry", () => {
  it("clientToData: colțuri plot ↔ domeniu", () => {
    const tl = clientToData(100, 50, plot, domain);
    expect(tl).toEqual({ x: 0, y: 10 });
    const br = clientToData(500, 250, plot, domain);
    expect(br).toEqual({ x: 100, y: 0 });
    const mid = clientToData(300, 150, plot, domain);
    expect(mid!.x).toBeCloseTo(50, 6);
    expect(mid!.y).toBeCloseTo(5, 6);
  });

  it("indicesInDataBox: selectează punctele din dreptunghi", () => {
    const pts = [
      { x: 10, y: 2, activeIdx: 0 },
      { x: 50, y: 5, activeIdx: 1 },
      { x: 90, y: 8, activeIdx: 2 },
      { x: 50, y: 9, activeIdx: 3 },
    ];
    expect(indicesInDataBox(pts, 40, 60, 4, 6)).toEqual([1]);
    expect(indicesInDataBox(pts, 0, 100, 0, 10).sort()).toEqual([0, 1, 2, 3]);
    // Ordinea colțurilor inversă (ca la tragere)
    expect(indicesInDataBox(pts, 60, 40, 6, 4)).toEqual([1]);
  });

  it("nearestActiveIndex: click pe punct", () => {
    const pts = [
      { x: 10, y: 2, activeIdx: 0 },
      { x: 50, y: 5, activeIdx: 1 },
      { x: 90, y: 8, activeIdx: 2 },
    ];
    expect(nearestActiveIndex(pts, 51, 5.1, domain)).toBe(1);
    expect(nearestActiveIndex(pts, 200, 50, domain)).toBeNull();
  });

  it("toggle / merge / range pe indici CSV", () => {
    expect(toggleIndex([1, 3], 2)).toEqual([1, 2, 3]);
    expect(toggleIndex([1, 2, 3], 2)).toEqual([1, 3]);
    expect(mergeIndices([1, 2], [2, 5])).toEqual([1, 2, 5]);
    expect(rangeIndices(3, 1)).toEqual([1, 2, 3]);
  });

  it("chartPayloadFromScatterArg: Recharts 3 entry.payload", () => {
    expect(
      chartPayloadFromScatterArg({
        cx: 10,
        cy: 20,
        payload: { id: "p5", activeIdx: 5, x: 1, y: 2 },
      })
    ).toEqual({ id: "p5", activeIdx: 5 });
    // Fără payload nested (deja ChartPt)
    expect(
      chartPayloadFromScatterArg({ id: "p1", activeIdx: 1 })
    ).toEqual({ id: "p1", activeIdx: 1 });
    expect(chartPayloadFromScatterArg({ cx: 1 })).toBeNull();
  });

  it("hit-test nu depinde de MARGIN.left greșit (regresie YAxis 72px)", () => {
    // Simulează plot real (grid) vs host cu YAxis
    const hostLeft = 0;
    const wrongMarginLeft = 20; // vechiul bug: ignora YAxis 72
    const realPlotLeft = hostLeft + 20 + 72;
    const realPlot = {
      left: realPlotLeft,
      top: 20,
      width: 500,
      height: 400,
    };
    const pts = [{ x: 50, y: 5, activeIdx: 7 }];
    // Click pe mijlocul plotului real
    const midClientX = realPlotLeft + 250;
    const midClientY = 20 + 200;
    const data = clientToData(midClientX, midClientY, realPlot, domain)!;
    expect(indicesInDataBox(pts, data.x - 1, data.x + 1, data.y - 1, data.y + 1)).toEqual([
      7,
    ]);
    // Cu conversie greșită (doar margin 20), același click ecran ar rata punctul
    const wrongPlot = {
      left: hostLeft + wrongMarginLeft,
      top: 20,
      width: 500 + 72,
      height: 400,
    };
    const wrong = clientToData(midClientX, midClientY, wrongPlot, domain)!;
    // x greșit e deplasat — nu trebuie să coincidă cu 50
    expect(Math.abs(wrong.x - 50)).toBeGreaterThan(5);
  });
});
