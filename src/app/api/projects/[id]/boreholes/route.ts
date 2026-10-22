import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const body = await req.json();
  const code = String(body.code ?? "").trim();
  if (!code) {
    return NextResponse.json(
      { error: "Codul forajului este obligatoriu." },
      { status: 400 }
    );
  }
  try {
    const borehole = await prisma.borehole.create({
      data: {
        projectId,
        code,
        notes: body.notes ? String(body.notes) : null,
      },
    });
    return NextResponse.json(borehole);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Eroare";
    return NextResponse.json(
      { error: `Nu s-a putut crea forajul: ${msg}` },
      { status: 400 }
    );
  }
}
