import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { emptyPayload } from "@/lib/schema/pmt-v1";
import { pushHistory } from "@/lib/payload";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: boreholeId } = await params;
  const body = await req.json();
  const label = String(body.label ?? "Test 1").trim() || "Test 1";
  const author = body.author ? String(body.author) : null;
  const payload = emptyPayload();
  const history = pushHistory([], "create", "Test creat manual", author ?? undefined);

  const test = await prisma.pmtTest.create({
    data: {
      boreholeId,
      label,
      depthM: body.depthM != null ? Number(body.depthM) : null,
      status: "DRAFT",
      author,
      testDate: body.testDate ? String(body.testDate) : null,
      payloadJson: JSON.stringify(payload),
      historyJson: JSON.stringify(history),
    },
  });
  return NextResponse.json(test);
}
