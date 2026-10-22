/**
 * Texte raport PDF — Română / English.
 * Doar pagina de raport; restul UI rămâne în română.
 */

export type ReportLocale = "ro" | "en";

export const REPORT_LOCALES: { value: ReportLocale; label: string }[] = [
  { value: "ro", label: "Română" },
  { value: "en", label: "English" },
];

const STORAGE_KEY = "flexipmt-report-locale";

export function loadReportLocale(): ReportLocale {
  if (typeof window === "undefined") return "ro";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "en" || v === "ro") return v;
  } catch {
    /* ignore */
  }
  return "ro";
}

export function saveReportLocale(locale: ReportLocale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
}

type Dict = {
  backToTest: string;
  exportCsv: string;
  printPdf: string;
  printHint: (file: string) => string;
  title: string;
  accordingTo: string;
  labFallback: string;
  missingRequired: string;
  optionalGaps: string;
  sec1: string;
  project: string;
  clientSite: string;
  boreholeTest: string;
  depthDate: string;
  testType: string;
  testTypeValue: string;
  tubeCsv: string;
  operatorFile: string;
  sec2: string;
  programme: string;
  programmeNone: string;
  confirmed: string;
  unconfirmed: string;
  confirmedF: string;
  unconfirmedF: string;
  controllingParam: string;
  controllingPressure: string;
  controllingRadial: string;
  controllingVolume: string;
  measurementBasis: string;
  basisRadial: string;
  basisVolume: string;
  boreholeDiameter: string;
  probePacker: string;
  cellLength: string;
  poisson: string;
  sec3: string;
  nominalMax: string;
  nominalTypical: string;
  pMax: string;
  pMaxNote: string;
  ps: string;
  csvPoint: string;
  rupture: string;
  sec4: string;
  noResults: string;
  colResult: string;
  colValue: string;
  colUnit: string;
  colFormula: string;
  formula5Note: string;
  sec5: string;
  chartIntro: (active: number, excluded: number) => string;
  chartFallback: string;
  chartCurve: string;
  chartPs: string;
  chartLimit: string;
  chartContact: string;
  chartFooter: string;
  chartLoading: string;
  sec6: string;
  calibration: string;
  factorsTrace: string;
  factorA1: string;
  factorA2: string;
  factorG: string;
  factorDriA: string;
  signatures: string;
  prepared: string;
  verified: string;
  nameSignature: string;
  footerApp: (version: string) => string;
  footerGenerated: (when: string) => string;
  dateLocale: string;
};

const ro: Dict = {
  backToTest: "← Înapoi la test",
  exportCsv: "Export CSV puncte (audit)",
  printPdf: "Tipărește / PDF A4",
  printHint: (file) =>
    `Fișier: ${file}.pdf. În dialog: debifați „Anteturi și subsoluri” / Headers and footers ca să nu apară data și ora pe pagină.`,
  title: "Prebored pressuremeter test",
  accordingTo: "Conform SR EN ISO 22476-5:2023",
  labFallback: "Laborator",
  missingRequired: "Obligatoriu / confirmări lipsă:",
  optionalGaps: "Opțional (nu blochează dacă nu e folosit):",
  sec1: "1. Identificare",
  project: "Proiect",
  clientSite: "Client / amplasament",
  boreholeTest: "Foraj / test",
  depthDate: "Adâncime / dată",
  testType: "Tip încercare",
  testTypeValue: "Presiometrie OYO (Elast Logger)",
  tubeCsv: "tub CSV",
  operatorFile: "Operator / fișier",
  sec2: "2. Program și geometrie",
  programme: "Program",
  programmeNone: "neselectat",
  confirmed: "(confirmat)",
  unconfirmed: "(neconfirmat)",
  confirmedF: "(confirmată)",
  unconfirmedF: "(neconfirmată)",
  controllingParam: "Mărime controlată pe teren",
  controllingPressure: "presiune",
  controllingRadial: "deplasare radială",
  controllingVolume: "volum",
  measurementBasis: "Bază de calcul modul",
  basisRadial: "Formula (5) — deplasare radială (dRi)",
  basisVolume: "Formula (6) — volum injectat",
  boreholeDiameter: "Diametru foraj",
  probePacker: "Sondă / packer",
  cellLength: "Lungime celulă activă",
  poisson: "ν (Poisson)",
  sec3: "3. Presiuni (nominal / pMax / ps)",
  nominalMax: "1. Maxim nominal aparat/sondă",
  nominalTypical: "— (tipic 20 MPa = 20 000 kPa)",
  pMax: "2. pMax efectiv înregistrat",
  pMaxNote: " — nu este pL / rupere",
  ps: "3. ps (așezare)",
  csvPoint: "punct CSV",
  rupture: "Presiune de rupere (consemnată)",
  sec4: "4. Rezultate program",
  noResults:
    "Nu există module calculate din selecții manuale pentru tipărire.",
  colResult: "Rezultat",
  colValue: "Valoare",
  colUnit: "Unitate",
  colFormula: "Formulă aplicată",
  formula5Note:
    "Bază radială: Formula (5) pe dRi/R din export; rs la ps din curba selectată (ISO 22476-5:2023, 6.3).",
  sec5: "5. Grafic final",
  chartIntro: (active, excluded) =>
    `Puncte CSV; selecții pe culori. n=${active}${excluded > 0 ? `, excl.=${excluded}` : ""}.`,
  chartFallback: "p–ΔV indisponibil (celulă neconfirmată) → p–R.",
  chartCurve: "Curbă",
  chartPs: "ps",
  chartLimit: "lim. practică",
  chartContact: "contact",
  chartFooter: "Ordine CSV Number · selecții pe toate axele.",
  chartLoading: "Se încarcă…",
  sec6: "6. Calibrări și corecții",
  calibration:
    "Valorile Pressure, dRi și R exportate de Elast Logger 3 reflectă calibrarea aparatului efectuată înaintea încercării. FlexiPMT le preia și le păstrează fără modificări și nu reaplică aceleași calibrări. Factorii înregistrați în fișierul testului sunt incluși pentru trasabilitate.",
  factorsTrace: "Factori din fișierul testului (trasabilitate):",
  factorA1: "A(1) — factor presiune (pantă)",
  factorA2: "A(2) — factor presiune (offset)",
  factorG: "G — gain rază (R)",
  factorDriA: "dRi(A) — factor deplasare radială",
  signatures: "Întocmit / Verificat",
  prepared: "Întocmit",
  verified: "Verificat",
  nameSignature: "Nume / semnătură",
  footerApp: (v) =>
    `Raport întocmit cu aplicația FlexiPMT, versiunea ${v}`,
  footerGenerated: (when) => `Generat la ${when}`,
  dateLocale: "ro-RO",
};

const en: Dict = {
  backToTest: "← Back to test",
  exportCsv: "Export points CSV (audit)",
  printPdf: "Print / PDF A4",
  printHint: (file) =>
    `File: ${file}.pdf. In the print dialog: uncheck “Headers and footers” so date/time do not appear on the page.`,
  title: "Prebored pressuremeter test",
  accordingTo: "According to SR EN ISO 22476-5:2023",
  labFallback: "Laboratory",
  missingRequired: "Required / missing confirmations:",
  optionalGaps: "Optional (does not block if unused):",
  sec1: "1. Identification",
  project: "Project",
  clientSite: "Client / site",
  boreholeTest: "Borehole / test",
  depthDate: "Depth / date",
  testType: "Test type",
  testTypeValue: "OYO pressuremeter (Elast Logger)",
  tubeCsv: "CSV tube",
  operatorFile: "Operator / file",
  sec2: "2. Programme and geometry",
  programme: "Programme",
  programmeNone: "not selected",
  confirmed: "(confirmed)",
  unconfirmed: "(unconfirmed)",
  confirmedF: "(confirmed)",
  unconfirmedF: "(unconfirmed)",
  controllingParam: "Field control",
  controllingPressure: "pressure",
  controllingRadial: "radial displacement",
  controllingVolume: "volume",
  measurementBasis: "Modulus basis",
  basisRadial: "Formula (5) — radial displacement (dRi)",
  basisVolume: "Formula (6) — injected volume",
  boreholeDiameter: "Borehole diameter",
  probePacker: "Probe / packer",
  cellLength: "Active cell length",
  poisson: "ν (Poisson)",
  sec3: "3. Pressures (nominal / pMax / ps)",
  nominalMax: "1. Nominal apparatus/probe max",
  nominalTypical: "— (typical 20 MPa = 20 000 kPa)",
  pMax: "2. Recorded effective pMax",
  pMaxNote: " — not pL / rupture",
  ps: "3. ps (seating)",
  csvPoint: "CSV point",
  rupture: "Rupture pressure (recorded)",
  sec4: "4. Programme results",
  noResults: "No moduli from manual selections for printing.",
  colResult: "Result",
  colValue: "Value",
  colUnit: "Unit",
  colFormula: "Formula",
  formula5Note:
    "Radial basis: Formula (5) on dRi/R; rs at ps (ISO 22476-5:2023, 6.3).",
  sec5: "5. Final chart",
  chartIntro: (active, excluded) =>
    `CSV points; colour selections. n=${active}${excluded > 0 ? `, excl.=${excluded}` : ""}.`,
  chartFallback: "p–ΔV unavailable (cell unconfirmed) → p–R.",
  chartCurve: "Curve",
  chartPs: "ps",
  chartLimit: "prac. limit",
  chartContact: "contact",
  chartFooter: "CSV Number order · selections on all axes.",
  chartLoading: "Loading…",
  sec6: "6. Calibrations and corrections",
  calibration:
    "Pressure, dRi and R from Elast Logger 3 reflect pre-test apparatus calibration. FlexiPMT keeps them unchanged and does not re-apply those calibrations. Test-file factors are listed for traceability.",
  factorsTrace: "Test-file factors (traceability):",
  factorA1: "A(1) — pressure (slope)",
  factorA2: "A(2) — pressure (offset)",
  factorG: "G — radius gain (R)",
  factorDriA: "dRi(A) — radial displacement",
  signatures: "Prepared / Checked",
  prepared: "Prepared",
  verified: "Checked",
  nameSignature: "Name / signature",
  footerApp: (v) => `Report prepared with FlexiPMT, version ${v}`,
  footerGenerated: (when) => `Generated at ${when}`,
  dateLocale: "en-GB",
};

const DICTS: Record<ReportLocale, Dict> = { ro, en };

export function reportT(locale: ReportLocale): Dict {
  return DICTS[locale] ?? ro;
}

/** Mesaje din missingRequiredFields / classifyReportGaps → EN. */
const GAP_EN: Record<string, string> = {
  "Puncte de măsurare": "Measurement points",
  "Program de încărcare (A/B/C/D) — selectat":
    "Loading programme (A/B/C/D) — selected",
  "Confirmarea programului de încărcare de către operator":
    "Operator confirmation of the loading programme",
  "ps: selectați punctul de așezare pe grafic (Number CSV + presiune)":
    "ps: select the seating point on the chart (CSV Number + pressure)",
  "Selecție manuală pe grafic pentru cel puțin un rezultat (GL1/GUi/…)":
    "Manual chart selection for at least one result (GL1/GUi/…)",
  "Selecție manuală pe grafic pentru cel puțin un rezultat":
    "Manual chart selection for at least one result",
  "Lungime celulă activă [m] — necesară pentru Formula (6) / Vs":
    "Active cell length [m] — required for Formula (6) / Vs",
  "Confirmarea lungimii celulei active folosite la Vs/ΔV":
    "Confirmation of the active cell length used for Vs/ΔV",
  "ν (Poisson) — necesar pentru parametrii derivați":
    "ν (Poisson) — required for derived parameters",
  "Bază GPBP pentru derivați (GL1 / GUR…)":
    "GPBP basis for derived parameters (GL1 / GUR…)",
  "Bază GPBP pentru derivați — bifați GL1 / GUR…":
    "GPBP basis for derived parameters — tick GL1 / GUR…",
  "Parametri derivați — alegeți baza (GL1/GUR…), ν, calculați; bifați includerea în raport":
    "Derived parameters — choose basis (GL1/GUR…), ν, compute; tick inclusion in report",
  "Limită practică — opțională pentru concluzia de limită (nu blochează modulele)":
    "Practical limit — optional for limit conclusion (does not block moduli)",
};

export function translateGapMessage(
  message: string,
  locale: ReportLocale
): string {
  if (locale === "ro") return message;
  return GAP_EN[message] ?? message;
}

/** Etichete rezultat pentru tabelul din raport. */
export function resultKeyLabelLocalized(
  key: string,
  locale: ReportLocale
): string {
  if (locale === "ro") {
    // același text ca resultKeyLabel — fără import circular
    return resultKeyLabelRo(key);
  }
  return resultKeyLabelEn(key);
}

function resultKeyLabelRo(key: string): string {
  if (key === "GL1")
    return "GL1 — modul de forfecare pe prima încărcare (GPBP)";
  if (key === "kf") return "kf — coeficient de creep (program C)";
  if (key === "G_manual")
    return "G manual — modul pe interval selectat (6.3/6.4.1)";
  if (key === "GU_final")
    return "GU_final — modul pe descărcarea finală (§6.4.1, nu GUR B)";
  if (key === "EPBP") return "EPBP — modulul lui Young";
  if (key === "kWinkler_GL1") return "Estimare Winkler derivată din GL1";
  const krFrom = /^Kr_(.+)$/.exec(key);
  if (krFrom) return `Kᵣ(${krFrom[1]}) — rigiditate radială`;
  const epbpFrom = /^EPBP_(.+)$/.exec(key);
  if (epbpFrom) return `EPBP(${epbpFrom[1]}) — modulul lui Young`;
  const kbFrom = /^Kb_(.+)$/.exec(key);
  if (kbFrom) return `Kb(${kbFrom[1]}) — modulul volumic`;
  const epsFrom = /^E_plane_strain_(.+)$/.exec(key);
  if (epsFrom)
    return `E_plane_strain(${epsFrom[1]}) — modul Young (deformație plană)`;
  const mFrom = /^M_(.+)$/.exec(key);
  if (mFrom) return `M(${mFrom[1]}) — modul constrâns`;
  const mvFrom = /^mv_(.+)$/.exec(key);
  if (mvFrom) return `mv(${mvFrom[1]}) — 1/M`;
  const lamFrom = /^lambda_(.+)$/.exec(key);
  if (lamFrom) return `λ(${lamFrom[1]}) — parametrul Lamé`;
  const guExpl = /^GU(\d+)_exploratory$/.exec(key);
  if (guExpl)
    return `GU${guExpl[1]} — modul exploratoriu pe ramură de descărcare (nu GURi Program B)`;
  const grExpl = /^GR(\d+)_exploratory$/.exec(key);
  if (grExpl)
    return `GR${grExpl[1]} — modul exploratoriu pe ramură de reîncărcare (nu GURi Program B)`;
  const gu = /^GU(\d+)$/.exec(key);
  if (gu)
    return `GU${gu[1]} — modul de forfecare pe descărcare ${gu[1]} (GPBP)`;
  const gr = /^GR(\d+)$/.exec(key);
  if (gr)
    return `GR${gr[1]} — modul de forfecare pe reîncărcare ${gr[1]} (GPBP)`;
  const gur = /^GUR(\d+)$/.exec(key);
  if (gur)
    return `GUR${gur[1]} — modul pe bucla descărcare–reîncărcare ${gur[1]} (GPBP)`;
  const cy = /^G_cycle(\d+)_exploratory$/.exec(key);
  if (cy)
    return `G ciclu ${cy[1]} — modul exploratoriu (6.3/6.4.1 — nu specific D)`;
  return key;
}

/** Etichete scurte EN — aceleași ca RO ca lungime, ca printul să rămână pe 2 pagini */
function resultKeyLabelEn(key: string): string {
  if (key === "GL1") return "GL1 — shear modulus, first loading (GPBP)";
  if (key === "kf") return "kf — creep coefficient (programme C)";
  if (key === "G_manual") return "G manual — selected interval (6.3/6.4.1)";
  if (key === "GU_final")
    return "GU_final — final unloading (§6.4.1, not GUR B)";
  if (key === "EPBP") return "EPBP — Young’s modulus";
  if (key === "kWinkler_GL1") return "Winkler estimate from GL1";
  const krFrom = /^Kr_(.+)$/.exec(key);
  if (krFrom) return `Kᵣ(${krFrom[1]}) — radial stiffness`;
  const epbpFrom = /^EPBP_(.+)$/.exec(key);
  if (epbpFrom) return `EPBP(${epbpFrom[1]}) — Young’s modulus`;
  const kbFrom = /^Kb_(.+)$/.exec(key);
  if (kbFrom) return `Kb(${kbFrom[1]}) — bulk modulus`;
  const epsFrom = /^E_plane_strain_(.+)$/.exec(key);
  if (epsFrom) return `E_plane_strain(${epsFrom[1]}) — plane strain`;
  const mFrom = /^M_(.+)$/.exec(key);
  if (mFrom) return `M(${mFrom[1]}) — constrained modulus`;
  const mvFrom = /^mv_(.+)$/.exec(key);
  if (mvFrom) return `mv(${mvFrom[1]}) — 1/M`;
  const lamFrom = /^lambda_(.+)$/.exec(key);
  if (lamFrom) return `λ(${lamFrom[1]}) — Lamé parameter`;
  const guExpl = /^GU(\d+)_exploratory$/.exec(key);
  if (guExpl) return `GU${guExpl[1]} — exploratory unload (not GURi B)`;
  const grExpl = /^GR(\d+)_exploratory$/.exec(key);
  if (grExpl) return `GR${grExpl[1]} — exploratory reload (not GURi B)`;
  const gu = /^GU(\d+)$/.exec(key);
  if (gu) return `GU${gu[1]} — shear modulus, unloading ${gu[1]} (GPBP)`;
  const gr = /^GR(\d+)$/.exec(key);
  if (gr) return `GR${gr[1]} — shear modulus, reloading ${gr[1]} (GPBP)`;
  const gur = /^GUR(\d+)$/.exec(key);
  if (gur) return `GUR${gur[1]} — unload–reload loop ${gur[1]} (GPBP)`;
  const cy = /^G_cycle(\d+)_exploratory$/.exec(key);
  if (cy) return `G cycle ${cy[1]} — exploratory (6.3/6.4.1)`;
  return key;
}

export function elastFactorTraceLocalized(
  factors: {
    factorA1?: number | null;
    factorA2?: number | null;
    factorG?: number | null;
    factorDriA?: number | null;
  } | null | undefined,
  locale: ReportLocale
): string | null {
  if (!factors) return null;
  const t = reportT(locale);
  const parts = [
    factors.factorA1 != null
      ? `${t.factorA1}=${factors.factorA1}`
      : null,
    factors.factorA2 != null
      ? `${t.factorA2}=${factors.factorA2}`
      : null,
    factors.factorG != null ? `${t.factorG}=${factors.factorG}` : null,
    factors.factorDriA != null
      ? `${t.factorDriA}=${factors.factorDriA}`
      : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("; ") : null;
}
