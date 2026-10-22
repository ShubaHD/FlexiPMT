import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { parseHistory, parsePayload } from "@/lib/payload";
import { TestWorkspace } from "@/components/test-workspace";

export default async function TestPage({
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

  const initial = {
    id: test.id,
    label: test.label,
    depthM: test.depthM,
    status: test.status,
    author: test.author,
    testDate: test.testDate,
    sourceFileName: test.sourceFileName,
    payload: parsePayload(test.payloadJson),
    history: parseHistory(test.historyJson),
    borehole: {
      id: test.borehole.id,
      code: test.borehole.code,
      project: {
        id: test.borehole.project.id,
        code: test.borehole.project.code,
        name: test.borehole.project.name,
        site: test.borehole.project.site,
      },
    },
  };

  return <TestWorkspace initial={initial} />;
}
