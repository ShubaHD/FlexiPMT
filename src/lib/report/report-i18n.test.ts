import { describe, expect, it } from "vitest";
import {
  reportT,
  resultKeyLabelInGroup,
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

  it("resultKeyLabelInGroup: scurt, fără sursă repetată", () => {
    expect(resultKeyLabelInGroup("GL1", "ro")).toMatch(/^GPBP/);
    expect(resultKeyLabelInGroup("EPBP_GUR1", "ro")).toMatch(/^EPBP/);
    expect(resultKeyLabelInGroup("EPBP_GUR1", "ro")).not.toMatch(/GUR1/);
  });

  it("translateGapMessage", () => {
    const ro = "Puncte de măsurare";
    expect(translateGapMessage(ro, "ro")).toBe(ro);
    expect(translateGapMessage(ro, "en")).toBe("Measurement points");
  });
});
