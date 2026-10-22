/**
 * Limite practice orientative packer — Elastmeter Digital Sonde (Model-4301),
 * tabel OYO „Applicable borehole diameter and max. pressure”
 * (Elast Logger-3i & Elastmeter Digital Sonde).
 *
 * Indicație practică: starea packerului și condițiile forajului pot reduce limita.
 * Operatorul trebuie să confirme limita admisă pentru configurația testului.
 *
 * Conversie: 1 MPa = 1000 kPa (ex. 20 MPa = 20 000 kPa).
 */

export type TubeSize = "BX" | "NX";
export type PackerHardness = "Hard" | "Soft";
export type ProbeModelId = "digital_sonde_4301" | "hq_4180" | "other";

/** Presiune maximă nominală aparat/sondă Digital Sonde — 20 MPa = 20 000 kPa */
export const NOMINAL_MAX_PRESSURE_MPA = 20;
export const NOMINAL_MAX_PRESSURE_KPA = NOMINAL_MAX_PRESSURE_MPA * 1000;

export type LimitRow = {
  packerDiameterMm: number;
  tubeSize: TubeSize;
  boreholeMaxMm: number;
  hardMPa: number;
  softMPa: number;
};

/** Tabel publicat OYO pentru Digital Sonde — packere 60 mm (BX) și 70 mm (NX). */
export const DIGITAL_SONDE_LIMIT_TABLE: LimitRow[] = [
  { packerDiameterMm: 60, tubeSize: "BX", boreholeMaxMm: 70, hardMPa: 20, softMPa: 5 },
  { packerDiameterMm: 60, tubeSize: "BX", boreholeMaxMm: 76, hardMPa: 8, softMPa: 4 },
  { packerDiameterMm: 60, tubeSize: "BX", boreholeMaxMm: 80, hardMPa: 3, softMPa: 1.5 },
  { packerDiameterMm: 70, tubeSize: "NX", boreholeMaxMm: 80, hardMPa: 20, softMPa: 5 },
  { packerDiameterMm: 70, tubeSize: "NX", boreholeMaxMm: 85, hardMPa: 8, softMPa: 4 },
  { packerDiameterMm: 70, tubeSize: "NX", boreholeMaxMm: 90, hardMPa: 3, softMPa: 1.5 },
];

export const TABLE_DISCLAIMER =
  "Tabel orientativ OYO (Digital Sonde). Starea packerului și condițiile forajului pot reduce limita — confirmați limita practică admisă pentru acest test.";

/** Packere listate pe Digital Sonde (60/70). 80/100 mm: doar modele compatibile (ex. HQ). */
export function packerDiametersForProbe(model: ProbeModelId | null): number[] {
  if (model === "hq_4180") return [70, 80, 100];
  if (model === "other") return [60, 70, 80, 100];
  // digital_sonde_4301 sau necunoscut: doar BX/NX din tabel
  return [60, 70];
}

export function mpaToKPa(mpa: number): number {
  return Math.round(mpa * 1000);
}

export function kPaToMPa(kPa: number): number {
  return kPa / 1000;
}

export function formatMPaKPa(mpa: number): string {
  return `${mpa} MPa = ${mpaToKPa(mpa).toLocaleString("ro-RO")} kPa`;
}

/**
 * Parsează „Tube type” Elast: NXH, NXS, BXH, BXS, NX Hard, etc.
 */
export function parseElastTubeType(raw: string | null | undefined): {
  tubeSize: TubeSize | null;
  packerHardness: PackerHardness | null;
  packerDiameterMm: number | null;
} {
  if (!raw) return { tubeSize: null, packerHardness: null, packerDiameterMm: null };
  const s = raw.trim().toUpperCase().replace(/\s+/g, "");
  let tubeSize: TubeSize | null = null;
  let packerHardness: PackerHardness | null = null;
  if (s.startsWith("NX") || s.includes("NX")) tubeSize = "NX";
  else if (s.startsWith("BX") || s.includes("BX")) tubeSize = "BX";

  if (/H(ARD)?$/.test(s) || s.endsWith("H") || /\bHARD\b/.test(raw.toUpperCase()))
    packerHardness = "Hard";
  else if (/S(OFT)?$/.test(s) || s.endsWith("S") || /\bSOFT\b/.test(raw.toUpperCase()))
    packerHardness = "Soft";
  // NXH / NXS — ultima literă
  if (packerHardness == null && (s === "NXH" || s === "BXH")) packerHardness = "Hard";
  if (packerHardness == null && (s === "NXS" || s === "BXS")) packerHardness = "Soft";

  const packerDiameterMm =
    tubeSize === "NX" ? 70 : tubeSize === "BX" ? 60 : null;
  return { tubeSize, packerHardness, packerDiameterMm };
}

/**
 * Sugerează limita practică (MPa) din tabel pentru diametrul forajului.
 * Alege cel mai mic boreholeMaxMm ≥ D_foraj pe același packer.
 */
export function suggestPracticalLimitMPa(opts: {
  packerDiameterMm: number | null;
  tubeSize: TubeSize | null;
  packerHardness: PackerHardness | null;
  boreholeDiameterMm: number | null;
}): {
  mPa: number | null;
  kPa: number | null;
  row: LimitRow | null;
  message: string;
} {
  const { packerDiameterMm, tubeSize, packerHardness, boreholeDiameterMm } = opts;
  if (
    packerDiameterMm == null ||
    tubeSize == null ||
    packerHardness == null ||
    boreholeDiameterMm == null ||
    !(boreholeDiameterMm > 0)
  ) {
    return {
      mPa: null,
      kPa: null,
      row: null,
      message:
        "Completați tipul tubului, Hard/Soft, diametrul packerului și diametrul forajului pentru sugestia din tabelul OYO.",
    };
  }

  const rows = DIGITAL_SONDE_LIMIT_TABLE.filter(
    (r) =>
      r.packerDiameterMm === packerDiameterMm && r.tubeSize === tubeSize
  ).sort((a, b) => a.boreholeMaxMm - b.boreholeMaxMm);

  if (rows.length === 0) {
    return {
      mPa: null,
      kPa: null,
      row: null,
      message:
        packerDiameterMm === 80 || packerDiameterMm === 100
          ? `Packer ${packerDiameterMm} mm nu are rând în tabelul Digital Sonde (60/70 mm). Introduceți manual limita practică și confirmați-o.`
          : "Combinația packer/tub nu se regăsește în tabelul OYO Digital Sonde.",
    };
  }

  const maxCovered = rows[rows.length - 1].boreholeMaxMm;
  if (boreholeDiameterMm > maxCovered) {
    return {
      mPa: null,
      kPa: null,
      row: null,
      message: `Diametrul forajului ${boreholeDiameterMm} mm depășește domeniul tabelului (≤${maxCovered} mm pentru packer ${packerDiameterMm} mm). Nu se sugerează automat o limită.`,
    };
  }

  const row = rows.find((r) => boreholeDiameterMm <= r.boreholeMaxMm) ?? null;
  if (!row) {
    return { mPa: null, kPa: null, row: null, message: "Nicio potrivire în tabel." };
  }
  const mPa = packerHardness === "Hard" ? row.hardMPa : row.softMPa;
  return {
    mPa,
    kPa: mpaToKPa(mPa),
    row,
    message: `Sugestie tabel OYO: foraj ≤${row.boreholeMaxMm} mm, packer ${row.packerDiameterMm} mm ${row.tubeSize} ${packerHardness} → ${formatMPaKPa(mPa)}. ${TABLE_DISCLAIMER}`,
  };
}
