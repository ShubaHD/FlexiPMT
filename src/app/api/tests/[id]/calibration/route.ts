import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseCalibrationCsv } from "@/lib/import/calibration-csv";
import { associateCalibrationDocument } from "@/lib/import/associate-calibration";
import { parseHistory, parsePayload, pushHistory, recomputePayload } from "@/lib/payload";

/**
 * Asociază un fișier KP/GA ca document de referință pentru aparat.
 * Fără efect asupra Pressure/dRi/R sau asupra rezultatelor calculate.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await req.json();
    const fileName = String(body.fileName ?? "calibration.csv");
    const text = String(body.text ?? "");
    if (!text.trim()) {
      return NextResponse.json(
        { error: "Conținutul fișierului de calibrare este gol." },
        { status: 400 }
      );
    }

    const test = await prisma.pmtTest.findUnique({ where: { id } });
    if (!test) {
      return NextResponse.json({ error: "Testul nu există." }, { status: 404 });
    }

    const parsed = parseCalibrationCsv(text, fileName);
    const before = parsePayload(test.payloadJson);
    const { payload: withDoc, association, warnings } =
      associateCalibrationDocument(before, parsed);

    // Recalcul pe aceleași date de măsurare — asocierea nu schimbă inputul de calcul
    const out = recomputePayload(withDoc);
    const payload = out.payload;

    let history = parseHistory(test.historyJson);
    history = pushHistory(
      history,
      "calibration-doc",
      `Document ${parsed.kind} ${fileName} asociat (fără efect pe calcul)`,
      body.author ? String(body.author) : undefined
    );

    const updated = await prisma.pmtTest.update({
      where: { id },
      data: {
        payloadJson: JSON.stringify(payload),
        historyJson: JSON.stringify(history),
      },
      include: { borehole: { include: { project: true } } },
    });

    return NextResponse.json({
      test: updated,
      payload,
      association,
      warnings: [
        ...warnings,
        ...out.warnings,
      ],
      history,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Eroare";
    return NextResponse.json(
      { error: `Asociere document calibrare eșuată: ${msg}` },
      { status: 400 }
    );
  }
}
