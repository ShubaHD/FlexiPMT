import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      boreholes: {
        include: { _count: { select: { tests: true } } },
      },
    },
  });
  return NextResponse.json(projects);
}

export async function POST(req: Request) {
  const body = await req.json();
  const code = String(body.code ?? "").trim();
  const name = String(body.name ?? "").trim();
  if (!code || !name) {
    return NextResponse.json(
      { error: "Codul și denumirea proiectului sunt obligatorii." },
      { status: 400 }
    );
  }
  try {
    const project = await prisma.project.create({
      data: {
        code,
        name,
        site: body.site ? String(body.site) : null,
        client: body.client ? String(body.client) : null,
        notes: body.notes ? String(body.notes) : null,
      },
    });
    return NextResponse.json(project);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Eroare la creare";
    return NextResponse.json(
      { error: `Nu s-a putut crea proiectul: ${msg}. Verificați că codul e unic.` },
      { status: 400 }
    );
  }
}
