import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function strOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const logoRaw = body.logoDataUrl;
    const logoDataUrl =
      logoRaw === null || logoRaw === ""
        ? null
        : typeof logoRaw === "string" && logoRaw.startsWith("data:image/")
          ? logoRaw
          : undefined;

    if (
      typeof logoDataUrl === "string" &&
      logoDataUrl.length > 1_500_000
    ) {
      return NextResponse.json(
        {
          error:
            "Logo prea mare. Folosiți o imagine mai mică (PNG/JPG recomandat).",
        },
        { status: 400 }
      );
    }

    const data = {
      companyName: String(body.companyName ?? ""),
      address: String(body.address ?? ""),
      phone: strOrNull(body.phone),
      email: strOrNull(body.email),
      accreditation: strOrNull(body.accreditation),
      preparedBy: strOrNull(body.preparedBy),
      verifiedBy: strOrNull(body.verifiedBy),
      ...(logoDataUrl !== undefined ? { logoDataUrl } : {}),
    };

    const settings = await prisma.labSettings.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        ...data,
        logoDataUrl: logoDataUrl ?? null,
      },
      update: data,
    });
    return NextResponse.json(settings);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Salvare setări eșuată";
    console.error("[api/settings]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
