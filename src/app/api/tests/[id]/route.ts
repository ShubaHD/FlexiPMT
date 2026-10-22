import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseHistory, parsePayload, pushHistory, recomputePayload } from "@/lib/payload";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const test = await prisma.pmtTest.findUnique({
    where: { id },
    include: {
      borehole: { include: { project: true } },
    },
  });
  if (!test) {
    return NextResponse.json({ error: "Testul nu există." }, { status: 404 });
  }
  return NextResponse.json({
    ...test,
    payload: parsePayload(test.payloadJson),
    history: parseHistory(test.historyJson),
  });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const existing = await prisma.pmtTest.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Testul nu există." }, { status: 404 });
  }

  let payload = body.payload
    ? parsePayload(JSON.stringify(body.payload))
    : parsePayload(existing.payloadJson);

  let warnings: string[] = [];
  let issues: string[] = [];
  if (body.recompute !== false) {
    const out = recomputePayload(payload);
    payload = out.payload;
    warnings = out.warnings;
    issues = out.issues;
  }

  let history = parseHistory(existing.historyJson);
  if (body.historyAction) {
    history = pushHistory(
      history,
      String(body.historyAction),
      body.historyDetail ? String(body.historyDetail) : undefined,
      body.author ? String(body.author) : existing.author ?? undefined
    );
  }

  const updated = await prisma.pmtTest.update({
    where: { id },
    data: {
      label: body.label != null ? String(body.label) : undefined,
      depthM: body.depthM !== undefined ? (body.depthM == null ? null : Number(body.depthM)) : undefined,
      status: body.status != null ? String(body.status) : undefined,
      author: body.author !== undefined ? (body.author ? String(body.author) : null) : undefined,
      testDate: body.testDate !== undefined ? (body.testDate ? String(body.testDate) : null) : undefined,
      sourceFileName:
        body.sourceFileName !== undefined
          ? body.sourceFileName
            ? String(body.sourceFileName)
            : null
          : undefined,
      payloadJson: JSON.stringify(payload),
      historyJson: JSON.stringify(history),
    },
    include: { borehole: { include: { project: true } } },
  });

  return NextResponse.json({
    ...updated,
    payload: parsePayload(updated.payloadJson),
    history: parseHistory(updated.historyJson),
    warnings,
    issues,
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const existing = await prisma.pmtTest.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Testul nu există." }, { status: 404 });
  }
  await prisma.pmtTest.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
