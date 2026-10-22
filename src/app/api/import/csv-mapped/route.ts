import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseMappedTable, type ColumnMapping } from "@/lib/import/elast-csv";
import { emptyPayload, rawToWorking } from "@/lib/schema/pmt-v1";
import { pushHistory, recomputePayload } from "@/lib/payload";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const boreholeId = String(body.boreholeId ?? "");
    const fileName = String(body.fileName ?? "data.csv");
    const rows = body.rows as Record<string, string>[];
    const mapping = body.mapping as ColumnMapping;

    if (!boreholeId) {
      return NextResponse.json({ error: "Selectați un foraj." }, { status: 400 });
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: "Nu există rânduri de previzualizat/importat." },
        { status: 400 }
      );
    }
    if (!mapping?.pressure) {
      return NextResponse.json(
        { error: "Mapați coloana de presiune înainte de import." },
        { status: 400 }
      );
    }

    const parsed = parseMappedTable(rows, mapping, fileName);
    if (parsed.rawPoints.length === 0) {
      return NextResponse.json(
        {
          error:
            "Niciun punct valid după mapare. Verificați unitățile și coloanele volum/rază.",
        },
        { status: 400 }
      );
    }

    let payload = emptyPayload();
    payload.rawPoints = parsed.rawPoints;
    payload.workingPoints = rawToWorking(parsed.rawPoints);
    payload.importSummary = { ...parsed.summary, sourceFormat: "csv-mapped" };

    const out = recomputePayload(payload);
    payload = out.payload;

    const history = pushHistory(
      [],
      "import",
      `Import CSV mapat ${fileName}; ${parsed.summary.pointsImported} puncte`,
      body.author ? String(body.author) : undefined
    );

    const test = await prisma.pmtTest.create({
      data: {
        boreholeId,
        label: `CSV ${fileName}`,
        status: "IMPORTED",
        author: body.author ? String(body.author) : null,
        sourceFileName: fileName,
        payloadJson: JSON.stringify(payload),
        historyJson: JSON.stringify(history),
      },
    });

    return NextResponse.json({
      test,
      summary: payload.importSummary,
      warnings: [...(payload.importSummary?.warnings ?? []), ...out.warnings],
      issues: out.issues,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Eroare";
    return NextResponse.json({ error: `Import mapat eșuat: ${msg}` }, { status: 400 });
  }
}
