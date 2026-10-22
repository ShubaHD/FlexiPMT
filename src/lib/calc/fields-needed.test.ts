import { describe, expect, it } from "vitest";
import {
  calculationBlockingFields,
  fieldsNeededForSelectedResults,
} from "@/lib/calc/fields-needed";
import {
  defaultRequiredInputs,
  emptyPayload,
} from "@/lib/schema/pmt-v1";
import { defaultProgrammeState } from "@/lib/calc/programme-types";

describe("fields-needed", () => {
  it("Formula (5) cere ps + selecție, nu ν / celulă", () => {
    const payload = emptyPayload();
    payload.workingPoints = [
      { id: "1", index: 1, pressureKPa: 100, volumeCm3: 0, status: "active" },
    ];
    payload.programmeState = {
      ...defaultProgrammeState(),
      programme: "B",
      programmeConfirmed: true,
      measurementBasis: "radial_displacement",
      selectionTargetKey: "GL1",
    };
    payload.requiredInputs = {
      ...defaultRequiredInputs(),
      computeEpbp: false,
    };

    const needed = fieldsNeededForSelectedResults(payload);
    expect(needed.some((f) => f.id === "ps" && !f.satisfied)).toBe(true);
    expect(needed.some((f) => f.id === "poisson")).toBe(false);
    expect(needed.some((f) => f.id === "cellLength")).toBe(false);
  });

  it("EPBP bifat cere ν", () => {
    const payload = emptyPayload();
    payload.programmeState = {
      ...defaultProgrammeState(),
      programme: "A",
      programmeConfirmed: true,
      fitOverrides: [
        { resultKey: "GL1", startIdx: 0, endIdx: 2, csvPointNumbers: [1, 2, 3] },
      ],
    };
    payload.requiredInputs = {
      ...defaultRequiredInputs(),
      psCsvPointNumber: 5,
      psManualKPa: 1000,
      computeEpbp: true,
      poisson: null,
    };
    const blocking = calculationBlockingFields(payload);
    expect(blocking.some((f) => f.id === "poisson")).toBe(true);
  });
});
