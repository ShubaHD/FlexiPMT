import { describe, expect, it } from "vitest";
import {
  NOMINAL_MAX_PRESSURE_KPA,
  mpaToKPa,
  parseElastTubeType,
  suggestPracticalLimitMPa,
  packerDiametersForProbe,
} from "@/lib/probe/oyo-probe-limits";

describe("oyo-probe-limits", () => {
  it("20 MPa = 20 000 kPa", () => {
    expect(mpaToKPa(20)).toBe(20000);
    expect(NOMINAL_MAX_PRESSURE_KPA).toBe(20000);
  });

  it("parsează Tube type NXH / NXS / BX", () => {
    expect(parseElastTubeType("NXH")).toEqual({
      tubeSize: "NX",
      packerHardness: "Hard",
      packerDiameterMm: 70,
    });
    expect(parseElastTubeType("NXS")).toEqual({
      tubeSize: "NX",
      packerHardness: "Soft",
      packerDiameterMm: 70,
    });
    expect(parseElastTubeType("BX Soft").tubeSize).toBe("BX");
  });

  it("NX 70 mm: tabel Hard/Soft pe diametru foraj", () => {
    const a = suggestPracticalLimitMPa({
      packerDiameterMm: 70,
      tubeSize: "NX",
      packerHardness: "Hard",
      boreholeDiameterMm: 76,
    });
    expect(a.mPa).toBe(20);
    expect(a.kPa).toBe(20000);

    const b = suggestPracticalLimitMPa({
      packerDiameterMm: 70,
      tubeSize: "NX",
      packerHardness: "Soft",
      boreholeDiameterMm: 82,
    });
    expect(b.mPa).toBe(4);

    const c = suggestPracticalLimitMPa({
      packerDiameterMm: 70,
      tubeSize: "NX",
      packerHardness: "Hard",
      boreholeDiameterMm: 88,
    });
    expect(c.mPa).toBe(3);
  });

  it("packere 80/100 doar pentru HQ / other", () => {
    expect(packerDiametersForProbe("digital_sonde_4301")).toEqual([60, 70]);
    expect(packerDiametersForProbe("hq_4180")).toContain(80);
    expect(packerDiametersForProbe("hq_4180")).toContain(100);
  });
});
