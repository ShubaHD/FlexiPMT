import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseElastLoggerCsv } from "@/lib/import/elast-csv";
import { emptyPayload, rawToWorking } from "@/lib/schema/pmt-v1";
import {
  parseHistory,
  parsePayload,
  pushHistory,
  recomputePayload,
} from "@/lib/payload";

function buildImportedPayload(
  parsed: ReturnType<typeof parseElastLoggerCsv>,
  previous?: ReturnType<typeof parsePayload>
) {
  let payload = emptyPayload();
  payload.rawPoints = parsed.rawPoints;
  payload.workingPoints = rawToWorking(parsed.rawPoints);
  payload.importSummary = parsed.summary;
  payload.elastMeta = parsed.metadata;
  payload.testFactors = parsed.metadata.factors;
  payload.rowIssues = parsed.rowIssues;
  payload.originalCsvText = parsed.originalText;
  payload.calibration.correctionsAlreadyApplied = true;
  payload.calibration.notes =
    "Import Elast: Pressure/dRi/R nemodificate; ΔV calculat de FlexiPMT. Fără reaplicare factori.";
  payload.reportStatus = "incomplete";
  // Păstrează intrările utilizator deja completate pe test (geometrie / ν),
  // dar resetează selecțiile de program (indicii de puncte se schimbă).
  if (previous?.requiredInputs) {
    payload.requiredInputs = { ...previous.requiredInputs };
  }
  if (previous?.associatedCalibrations?.length) {
    payload.associatedCalibrations = previous.associatedCalibrations;
  }
  return recomputePayload(payload);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const boreholeId = String(body.boreholeId ?? "");
    const testId = String(body.testId ?? "");
    const fileName = String(body.fileName ?? "data.csv");
    const text = String(body.text ?? "");
    const previewOnly = Boolean(body.previewOnly);
    const author = body.author ? String(body.author) : undefined;

    if (!text.trim()) {
      return NextResponse.json(
        { error: "Conținutul CSV este gol." },
        { status: 400 }
      );
    }

    const parsed = parseElastLoggerCsv(text, fileName);

    if (previewOnly) {
      return NextResponse.json({
        preview: true,
        metadata: parsed.metadata,
        summary: parsed.summary,
        rowIssues: parsed.rowIssues,
        pointsDetected: parsed.devicePoints.length,
        pointsValid: parsed.rawPoints.length,
        firstReading: parsed.firstReading,
        lastReading: parsed.lastReading,
        factors: parsed.metadata.factors,
      });
    }

    const detail = `Import Elast CSV ${fileName}; ${parsed.devicePoints.length} puncte citite, ${parsed.rawPoints.length} valide; Data size=${parsed.metadata.dataSize ?? "?"}`;

    if (testId) {
      const existing = await prisma.pmtTest.findUnique({ where: { id: testId } });
      if (!existing) {
        return NextResponse.json(
          { error: "Testul țintă nu există." },
          { status: 404 }
        );
      }
      const previous = parsePayload(existing.payloadJson);
      const out = buildImportedPayload(parsed, previous);
      const history = pushHistory(
        parseHistory(existing.historyJson),
        "import",
        detail,
        author
      );
      const test = await prisma.pmtTest.update({
        where: { id: testId },
        data: {
          label: parsed.metadata.fileId
            ? `EL-${parsed.metadata.fileId}`
            : existing.label,
          depthM: parsed.metadata.depthM ?? existing.depthM,
          status: "IMPORTED",
          author: author ?? existing.author,
          testDate: parsed.metadata.testDate ?? existing.testDate,
          sourceFileName: fileName,
          payloadJson: JSON.stringify(out.payload),
          historyJson: JSON.stringify(history),
        },
      });

      return NextResponse.json({
        test,
        summary: parsed.summary,
        metadata: parsed.metadata,
        rowIssues: parsed.rowIssues,
        firstReading: parsed.firstReading,
        lastReading: parsed.lastReading,
        pointsDetected: parsed.devicePoints.length,
        pointsValid: parsed.rawPoints.length,
        warnings: [...parsed.summary.warnings, ...out.warnings],
        issues: out.issues,
        missingRequired: out.missingRequired,
        replaced: true,
      });
    }

    if (!boreholeId) {
      return NextResponse.json(
        { error: "Selectați un foraj țintă." },
        { status: 400 }
      );
    }

    const out = buildImportedPayload(parsed);
    const history = pushHistory([], "import", detail, author);

    const test = await prisma.pmtTest.create({
      data: {
        boreholeId,
        label: parsed.metadata.fileId
          ? `EL-${parsed.metadata.fileId}`
          : `CSV ${fileName}`,
        depthM: parsed.metadata.depthM ?? null,
        status: "IMPORTED",
        author: author ?? null,
        testDate: parsed.metadata.testDate ?? null,
        sourceFileName: fileName,
        payloadJson: JSON.stringify(out.payload),
        historyJson: JSON.stringify(history),
      },
    });

    return NextResponse.json({
      test,
      summary: parsed.summary,
      metadata: parsed.metadata,
      rowIssues: parsed.rowIssues,
      firstReading: parsed.firstReading,
      lastReading: parsed.lastReading,
      pointsDetected: parsed.devicePoints.length,
      pointsValid: parsed.rawPoints.length,
      warnings: [...parsed.summary.warnings, ...out.warnings],
      issues: out.issues,
      missingRequired: out.missingRequired,
      replaced: false,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Eroare necunoscută";
    return NextResponse.json({ error: `Import CSV eșuat: ${msg}` }, { status: 400 });
  }
}
