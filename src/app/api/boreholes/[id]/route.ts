import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const borehole = await prisma.borehole.findUnique({
    where: { id },
    include: {
      project: true,
      tests: { orderBy: { updatedAt: "desc" } },
    },
  });
  if (!borehole) {
    return NextResponse.json({ error: "Forajul nu există." }, { status: 404 });
  }
  return NextResponse.json(borehole);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const existing = await prisma.borehole.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Forajul nu există." }, { status: 404 });
  }

  const body = await req.json();
  const code =
    body.code !== undefined ? String(body.code ?? "").trim() : undefined;
  const notes =
    body.notes !== undefined
      ? body.notes
        ? String(body.notes).trim()
        : null
      : undefined;

  if (code !== undefined && !code) {
    return NextResponse.json(
      { error: "Codul / numele forajului este obligatoriu." },
      { status: 400 }
    );
  }

  try {
    const borehole = await prisma.borehole.update({
      where: { id },
      data: {
        ...(code !== undefined ? { code } : {}),
        ...(notes !== undefined ? { notes } : {}),
      },
    });
    return NextResponse.json(borehole);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Eroare la salvare";
    return NextResponse.json(
      {
        error: `Nu s-a putut actualiza forajul: ${msg}. Verificați că numele e unic în proiect.`,
      },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const existing = await prisma.borehole.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Forajul nu există." }, { status: 404 });
  }
  await prisma.borehole.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
