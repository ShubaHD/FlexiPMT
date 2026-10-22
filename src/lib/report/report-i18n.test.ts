import { describe, expect, it } from "vitest";
import {
  reportT,
  resultKeyLabelLocalized,
  translateGapMessage,
} from "@/lib/report/report-i18n";

describe("report-i18n", () => {
  it("titlu raport identic RO / EN", () => {
    expect(reportT("ro").title).toBe("Prebored pressuremeter test");
    expect(reportT("en").title).toBe("Prebored pressuremeter test");
  });

  it("resultKeyLabelLocalized", () => {
    expect(resultKeyLabelLocalized("GL1", "ro")).toMatch(/forfecare/);
    expect(resultKeyLabelLocalized("GL1", "en")).toMatch(/shear modulus/i);
    expect(resultKeyLabelLocalized("GUR2", "en")).toMatch(/unload–reload/i);
  });

  it("translateGapMessage", () => {
    const ro = "Puncte de măsurare";
    expect(translateGapMessage(ro, "ro")).toBe(ro);
    expect(translateGapMessage(ro, "en")).toBe("Measurement points");
  });
});
