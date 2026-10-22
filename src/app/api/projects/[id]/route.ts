import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      boreholes: {
        include: { _count: { select: { tests: true } } },
      },
    },
  });
  if (!project) {
    return NextResponse.json({ error: "Proiectul nu există." }, { status: 404 });
  }
  return NextResponse.json(project);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const existing = await prisma.project.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Proiectul nu există." }, { status: 404 });
  }

  const body = await req.json();
  const name =
    body.name !== undefined ? String(body.name ?? "").trim() : undefined;
  const code =
    body.code !== undefined ? String(body.code ?? "").trim() : undefined;
  const site =
    body.site !== undefined
      ? body.site
        ? String(body.site).trim()
        : null
      : undefined;
  const client =
    body.client !== undefined
      ? body.client
        ? String(body.client).trim()
        : null
      : undefined;

  if (name !== undefined && !name) {
    return NextResponse.json(
      { error: "Denumirea proiectului este obligatorie." },
      { status: 400 }
    );
  }
  if (code !== undefined && !code) {
    return NextResponse.json(
      { error: "Codul proiectului este obligatoriu." },
      { status: 400 }
    );
  }

  try {
    const project = await prisma.project.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(code !== undefined ? { code } : {}),
        ...(site !== undefined ? { site } : {}),
        ...(client !== undefined ? { client } : {}),
      },
    });
    return NextResponse.json(project);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Eroare la salvare";
    return NextResponse.json(
      {
        error: `Nu s-a putut actualiza proiectul: ${msg}. Verificați că codul e unic.`,
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
  const existing = await prisma.project.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Proiectul nu există." }, { status: 404 });
  }
  await prisma.project.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
