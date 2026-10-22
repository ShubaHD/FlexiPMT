import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { importOyoJson, type OyoJsonDocument } from "@/lib/import/oyo-json";
import { recomputePayload, pushHistory } from "@/lib/payload";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const boreholeId = String(body.boreholeId ?? "");
    const fileName = String(body.fileName ?? "import.flexipmt.json");
    const doc = body.document as OyoJsonDocument;

    if (!boreholeId) {
      return NextResponse.json(
        { error: "Selectați un foraj țintă (boreholeId)." },
        { status: 400 }
      );
    }
    if (!doc || typeof doc !== "object") {
      return NextResponse.json(
        {
          error:
            "Lipsește documentul JSON. Mai întâi rulați tools/oyo_migrate.py --trusted pe fișierul .oyo.",
        },
        { status: 400 }
      );
    }

    const bh = await prisma.borehole.findUnique({ where: { id: boreholeId } });
    if (!bh) {
      return NextResponse.json({ error: "Forajul nu există." }, { status: 404 });
    }

    const imported = importOyoJson(doc, fileName);
    const { payload, warnings, issues } = recomputePayload(imported.payload);
    const history = pushHistory(
      [],
      "import",
      `Import JSON migrat din ${imported.summary.sourceFileName}; ${imported.summary.pointsImported} puncte`,
      body.author ? String(body.author) : undefined
    );

    const test = await prisma.pmtTest.create({
      data: {
        boreholeId,
        label: imported.meta.testLabel || `Import ${fileName}`,
        depthM: imported.meta.depthM ?? null,
        status: "IMPORTED",
        author: body.author ? String(body.author) : null,
        testDate: imported.meta.testDate ?? null,
        sourceFileName: imported.summary.sourceFileName,
        payloadJson: JSON.stringify(payload),
        historyJson: JSON.stringify(history),
      },
    });

    return NextResponse.json({
      test,
      summary: imported.summary,
      warnings: [...imported.summary.warnings, ...warnings],
      issues,
      meta: imported.meta,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Eroare necunoscută";
    return NextResponse.json(
      {
        error: `Import eșuat: ${msg}. Verificați că JSON-ul vine din tools/oyo_migrate.py.`,
      },
      { status: 400 }
    );
  }
}
