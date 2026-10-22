"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { HistoryEntry, PmtPayloadV1 } from "@/lib/schema/pmt-v1";
import {
  APP_VERSION,
  defaultRequiredInputs,
  missingRequiredFields,
} from "@/lib/schema/pmt-v1";
import { PmtChart } from "@/components/pmt-chart";
import { defaultChartTickSettings } from "@/lib/chart/chart-ticks";
import { CHART_AXIS_OPTIONS } from "@/lib/chart/chart-axis";
import {
  classifyReportGaps,
  formatMPaFromKPa,
  programmeModulusResults,
  reportChartAxisMode,
  reportDerivedParameterResults,
  reportPdfBaseName,
  usedFormulas,
} from "@/lib/report/report-content";
import {
  elastFactorTraceLocalized,
  loadReportLocale,
  REPORT_LOCALES,
  reportT,
  resultKeyLabelLocalized,
  saveReportLocale,
  translateGapMessage,
  type ReportLocale,
} from "@/lib/report/report-i18n";

const APP_DOC_TITLE = "FlexiPMT — Presiometrie OYO";

type Props = {
  test: {
    id: string;
    label: string;
    depthM: number | null;
    status: string;
    author: string | null;
    testDate: string | null;
    sourceFileName: string | null;
    updatedAt: string;
  };
  borehole: { code: string };
  project: {
    code: string;
    name: string;
    site: string | null;
    client: string | null;
  };
  payload: PmtPayloadV1;
  history: HistoryEntry[];
  companyName: string;
  companyAddress: string;
  logoDataUrl?: string | null;
  preparedBy?: string | null;
  verifiedBy?: string | null;
};

export function ReportView({
  test,
  borehole,
  project,
  payload,
  history: _history,
  companyName,
  companyAddress,
  logoDataUrl = null,
  preparedBy = null,
  verifiedBy = null,
}: Props) {
  const [locale, setLocale] = useState<ReportLocale>("ro");
  const t = reportT(locale);

  useEffect(() => {
    setLocale(loadReportLocale());
  }, []);

  function setReportLocale(next: ReportLocale) {
    setLocale(next);
    saveReportLocale(next);
  }

  const interp = payload.interpretation;
  const ri = {
    ...defaultRequiredInputs(),
    ...(payload.requiredInputs ?? {}),
  };
  const missing = missingRequiredFields(payload).map((m) =>
    translateGapMessage(m, locale)
  );
  const gaps = classifyReportGaps(payload);
  const optionalGaps = gaps
    .filter((g) => g.kind === "optional_result")
    .map((g) => ({
      ...g,
      message: translateGapMessage(g.message, locale),
    }));
  const activeCount = payload.workingPoints.filter(
    (p) => p.status !== "excluded"
  ).length;
  const excludedCount = payload.workingPoints.filter(
    (p) => p.status === "excluded"
  ).length;
  const generatedAt = new Date();
  const generatedAtLabel = generatedAt.toLocaleString(t.dateLocale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const footerParts = [
    t.footerApp(APP_VERSION),
    companyName.trim() || null,
    t.footerGenerated(generatedAtLabel),
  ].filter(Boolean);
  const ps = payload.programmeState;
  const chartMode = reportChartAxisMode(payload);
  const chartLabel =
    CHART_AXIS_OPTIONS.find((o) => o.value === chartMode)?.label ?? chartMode;
  const moduli = programmeModulusResults(payload.results ?? []);
  const derived = reportDerivedParameterResults(payload);
  const formulas = usedFormulas(payload);
  const factorTrace = elastFactorTraceLocalized(
    payload.elastMeta?.factors ?? payload.testFactors ?? null,
    locale
  );
  const showRupture =
    interp.rupturePressureKPa != null &&
    Number.isFinite(interp.rupturePressureKPa) &&
    interp.ruptureOrigin !== "unavailable";
  const showCellLength =
    ps?.measurementBasis === "injected_volume" ||
    formulas.some((f) => f.includes("Formula (6)"));
  const showPoisson =
    derived.length > 0 || (ri.includeDerivedInReport && ri.poisson != null);
  const chartFallbackNote =
    payload.programmeState?.chartAxisMode === "p_dV" && chartMode !== "p_dV"
      ? t.chartFallback
      : null;

  const depthForPdf = test.depthM ?? payload.elastMeta?.depthM ?? null;
  const pdfBase = reportPdfBaseName(borehole.code, depthForPdf);

  useEffect(() => {
    const prev = document.title;
    document.title = pdfBase;
    return () => {
      document.title = prev || APP_DOC_TITLE;
    };
  }, [pdfBase]);

  function printReportPdf() {
    document.title = pdfBase;
    window.print();
  }

  function controllingParamLabel(v: string | undefined): string {
    if (v === "pressure") return t.controllingPressure;
    if (v === "radial_displacement") return t.controllingRadial;
    if (v === "volume") return t.controllingVolume;
    return v ?? "—";
  }

  function measurementBasisLabel(v: string | undefined): string {
    if (v === "radial_displacement") return t.basisRadial;
    if (v === "injected_volume") return t.basisVolume;
    return v ?? "—";
  }

  const programmeLabel =
    !ps || ps.programme === "none"
      ? t.programmeNone
      : `${ps.programme} ${ps.programmeConfirmed ? t.confirmed : t.unconfirmed}`;

  return (
    <div className="space-y-4 print:space-y-0">
      <div className="flex flex-wrap items-center justify-between gap-2 no-print">
        <Link href={`/tests/${test.id}`} className="btn">
          {t.backToTest}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex overflow-hidden rounded border border-line text-xs"
            role="group"
            aria-label="Limba raportului / Report language"
          >
            {REPORT_LOCALES.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={
                  locale === opt.value
                    ? "bg-ink px-2.5 py-1.5 font-medium text-white"
                    : "bg-panel px-2.5 py-1.5 text-muted hover:bg-accent-soft"
                }
                onClick={() => setReportLocale(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn"
            onClick={() => {
              const rows = [
                [
                  "index",
                  "status",
                  "exclude_reason",
                  "pressure_MPa",
                  "pressure_kPa",
                  "dRi_mm",
                  "R_mm",
                  "dV_cm3",
                ],
                ...payload.workingPoints.map((p) => [
                  p.index,
                  p.status,
                  p.excludeReason ?? "",
                  p.pressureMPa ?? "",
                  p.pressureKPa,
                  p.dRiMm ?? "",
                  p.radiusMm ?? "",
                  p.volumeCm3,
                ]),
              ];
              const csv = rows.map((r) => r.join(",")).join("\n");
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${test.label.replace(/\s+/g, "_")}_puncte.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            {t.exportCsv}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={printReportPdf}
          >
            {t.printPdf}
          </button>
          <span className="max-w-xs text-[0.7rem] text-muted">
            {t.printHint(pdfBase)}
          </span>
        </div>
      </div>

      <article
        className="report-a4 card mx-auto space-y-3 print:space-y-2 print:border-0 print:shadow-none print:p-0"
        lang={locale === "en" ? "en" : "ro"}
      >
        <header className="report-block border-b border-line pb-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-muted">
                {companyName || t.labFallback}
              </div>
              {companyAddress && (
                <div className="text-[0.7rem] text-muted">{companyAddress}</div>
              )}
            </div>
            {logoDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoDataUrl}
                alt=""
                className="report-logo max-h-14 max-w-[9rem] object-contain"
              />
            )}
          </div>
          <h1 className="mt-1 font-[family-name:var(--font-dm)] text-lg font-semibold leading-tight">
            {t.title}
          </h1>
          <p className="text-sm text-muted">{t.accordingTo}</p>
        </header>

        {(missing.length > 0 || optionalGaps.length > 0) && (
          <section className="report-block no-print rounded border border-amber-300 bg-amber-50 p-2 text-xs">
            {missing.length > 0 && (
              <div>
                <strong>{t.missingRequired}</strong> {missing.join("; ")}
              </div>
            )}
            {optionalGaps.length > 0 && (
              <div className="mt-1 text-muted">
                <strong>{t.optionalGaps}</strong>{" "}
                {optionalGaps.map((g) => g.message).join("; ")}
              </div>
            )}
          </section>
        )}

        <section className="report-block">
          <h2 className="mb-1 text-sm font-medium">{t.sec1}</h2>
          <dl className="report-dl">
            <dt>{t.project}</dt>
            <dd>
              {project.code} — {project.name}
            </dd>
            <dt>{t.clientSite}</dt>
            <dd>
              {project.client || "—"} / {project.site || "—"}
            </dd>
            <dt>{t.boreholeTest}</dt>
            <dd>
              {borehole.code} / {test.label}
            </dd>
            <dt>{t.depthDate}</dt>
            <dd>
              {test.depthM != null ? `${test.depthM} m` : "—"} /{" "}
              {test.testDate || payload.elastMeta?.testDate || "—"}
            </dd>
            <dt>{t.testType}</dt>
            <dd>
              {t.testTypeValue}
              {payload.elastMeta?.tubeType
                ? ` · ${t.tubeCsv} ${payload.elastMeta.tubeType}`
                : ""}
            </dd>
          </dl>
        </section>

        <section className="report-block">
          <h2 className="mb-1 text-sm font-medium">{t.sec2}</h2>
          <dl className="report-dl">
            <dt>{t.programme}</dt>
            <dd>{programmeLabel}</dd>
            <dt>{t.controllingParam}</dt>
            <dd>{controllingParamLabel(ps?.controllingParameter)}</dd>
            <dt>{t.measurementBasis}</dt>
            <dd>{measurementBasisLabel(ps?.measurementBasis)}</dd>
            <dt>{t.boreholeDiameter}</dt>
            <dd>
              {ri.boreholeDiameterMm != null
                ? `${ri.boreholeDiameterMm} mm`
                : "—"}
            </dd>
            <dt>{t.probePacker}</dt>
            <dd>
              {ri.tubeSize ?? "—"} / {ri.packerHardness ?? "—"} / Ø{" "}
              {ri.packerDiameterMm ?? "—"} mm{" "}
              {ri.tubeConfigConfirmed ? t.confirmed : t.unconfirmed}
            </dd>
            {showCellLength && (
              <>
                <dt>{t.cellLength}</dt>
                <dd>
                  {ri.cellLengthM != null ? `${ri.cellLengthM} m` : "—"}{" "}
                  {ri.cellLengthConfirmed ? t.confirmedF : t.unconfirmedF}
                </dd>
              </>
            )}
            {showPoisson && (
              <>
                <dt>{t.poisson}</dt>
                <dd>{ri.poisson != null ? String(ri.poisson) : "—"}</dd>
              </>
            )}
          </dl>
        </section>

        <section className="report-block">
          <h2 className="mb-1 text-sm font-medium">{t.sec3}</h2>
          <dl className="report-dl">
            <dt>{t.nominalMax}</dt>
            <dd>
              {ri.nominalMaxPressureKPa != null
                ? formatMPaFromKPa(ri.nominalMaxPressureKPa)
                : t.nominalTypical}
            </dd>
            <dt>{t.pMax}</dt>
            <dd>
              {formatMPaFromKPa(interp.pMaxKPa)}
              <span className="text-muted">{t.pMaxNote}</span>
            </dd>
            <dt>{t.ps}</dt>
            <dd>
              {formatMPaFromKPa(interp.psKPa)}
              {ri.psCsvPointNumber != null
                ? ` · ${t.csvPoint} #${ri.psCsvPointNumber}`
                : ""}{" "}
              · {interp.psOrigin}
            </dd>
            {showRupture && (
              <>
                <dt>{t.rupture}</dt>
                <dd>{formatMPaFromKPa(interp.rupturePressureKPa)}</dd>
              </>
            )}
          </dl>
        </section>

        <section className="report-block">
          <h2 className="mb-1 text-sm font-medium">
            {t.sec4}
            {ps?.programme && ps.programme !== "none"
              ? ` (${ps.programme})`
              : ""}
          </h2>
          {moduli.length === 0 && derived.length === 0 ? (
            <p className="text-xs text-muted">{t.noResults}</p>
          ) : (
            <table className="report-table">
              <thead>
                <tr>
                  <th>{t.colResult}</th>
                  <th>{t.colValue}</th>
                  <th>{t.colUnit}</th>
                  <th>{t.colFormula}</th>
                </tr>
              </thead>
              <tbody>
                {[...moduli, ...derived].map((r) => (
                  <tr key={r.key}>
                    <td>{resultKeyLabelLocalized(r.key, locale)}</td>
                    <td>
                      {r.value == null
                        ? "—"
                        : Number(r.value).toPrecision(3)}
                    </td>
                    <td>{r.unit || "—"}</td>
                    <td className="text-[0.7rem] text-muted">
                      {r.formula?.trim() || "—"}
                      {r.variables ? (
                        <div className="mt-0.5 print:hidden">{r.variables}</div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {usesFormula5Note(payload) && (
            <p className="mt-2 text-[0.7rem] text-muted">{t.formula5Note}</p>
          )}
        </section>

        <div className="report-page-2">
          <section className="report-block report-chart">
            <h2 className="mb-1 text-sm font-medium">
              {t.sec5} ({chartLabel})
            </h2>
            <p className="mb-1 text-[0.7rem] text-muted no-print">
              {t.chartIntro(activeCount, excludedCount)}
              {chartFallbackNote ? ` ${chartFallbackNote}` : ""}
            </p>
            <div className="w-full min-w-0">
              <PmtChart
                points={payload.workingPoints}
                selectedPointId={null}
                onSelect={() => {}}
                psKPa={interp.psKPa}
                apparatusLimitKPa={interp.apparatusLimitKPa}
                heightPx={240}
                readOnly
                locale={locale}
                chartAxisMode={chartMode}
                chartTickSettings={
                  payload.programmeState?.chartTickSettings ??
                  defaultChartTickSettings()
                }
                boreholeDiameterMm={ri.boreholeDiameterMm}
                fitOverrides={payload.programmeState?.fitOverrides ?? []}
                psCsvPointNumber={ri.psCsvPointNumber}
              />
            </div>
          </section>

          <section className="report-block">
            <h2 className="mb-1 text-sm font-medium">{t.sec6}</h2>
            <p className="text-xs leading-snug">{t.calibration}</p>
            {factorTrace && (
              <p className="mt-1 text-xs">
                <strong>{t.factorsTrace}</strong> {factorTrace}
              </p>
            )}
          </section>

          <section className="report-block report-signatures border-t border-line pt-2">
            <div className="grid grid-cols-2 gap-10 text-sm">
              <div>
                <div className="text-xs text-muted">
                  {t.prepared}
                  {preparedBy?.trim() ? `: ${preparedBy.trim()}` : ""}
                </div>
                <div className="mt-7 min-h-[1.75rem] border-b border-line print:mt-5" />
              </div>
              <div>
                <div className="text-xs text-muted">
                  {t.verified}
                  {verifiedBy?.trim() ? `: ${verifiedBy.trim()}` : ""}
                </div>
                <div className="mt-7 min-h-[1.75rem] border-b border-line print:mt-5" />
              </div>
            </div>
          </section>

          <footer className="report-block report-doc-footer border-t border-line pt-1.5 text-[0.65rem] text-muted">
            {footerParts.join(" · ")}
          </footer>
        </div>
      </article>
    </div>
  );
}

function usesFormula5Note(payload: PmtPayloadV1): boolean {
  return (
    payload.programmeState?.measurementBasis !== "injected_volume" &&
    usedFormulas(payload).some((f) => f.includes("Formula (5)"))
  );
}
