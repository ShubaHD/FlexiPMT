import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { parsePayload, parseHistory } from "@/lib/payload";
import { reportPdfBaseName } from "@/lib/report/report-content";
import { ReportView } from "./report-view";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const test = await prisma.pmtTest.findUnique({
    where: { id },
    include: { borehole: true },
  });
  if (!test) return { title: "Raport" };
  const payload = parsePayload(test.payloadJson);
  const depth = test.depthM ?? payload.elastMeta?.depthM ?? null;
  return {
    title: {
      absolute: reportPdfBaseName(test.borehole.code, depth),
    },
  };
}

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const test = await prisma.pmtTest.findUnique({
    where: { id },
    include: { borehole: { include: { project: true } } },
  });
  if (!test) notFound();

  const settings = await prisma.labSettings.findUnique({
    where: { id: "default" },
  });

  return (
    <ReportView
      test={{
        id: test.id,
        label: test.label,
        depthM: test.depthM,
        status: test.status,
        author: test.author,
        testDate: test.testDate,
        sourceFileName: test.sourceFileName,
        updatedAt: test.updatedAt.toISOString(),
      }}
      borehole={test.borehole}
      project={test.borehole.project}
      payload={parsePayload(test.payloadJson)}
      history={parseHistory(test.historyJson)}
      companyName={settings?.companyName || ""}
      companyAddress={settings?.address || ""}
      logoDataUrl={settings?.logoDataUrl || null}
      preparedBy={settings?.preparedBy || null}
      verifiedBy={settings?.verifiedBy || null}
    />
  );
}
