import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { DeleteEntityButton } from "@/components/delete-entity-button";
import { EditBoreholeForm } from "./edit-borehole-form";
import { NewTestForm } from "./new-test-form";
import { ElastCsvImport } from "@/components/elast-csv-import";
import { STATUS_LABELS, type TestStatus } from "@/lib/types";

export default async function BoreholePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const borehole = await prisma.borehole.findUnique({
    where: { id },
    include: {
      project: true,
      tests: { orderBy: { updatedAt: "desc" } },
    },
  });
  if (!borehole) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm text-muted">
            <Link
              href={`/projects/${borehole.projectId}`}
              className="hover:underline"
            >
              {borehole.project.code}
            </Link>
            {" / "}
            Foraj
          </div>
          <h1 className="font-[family-name:var(--font-dm)] text-2xl font-semibold">
            {borehole.code}
          </h1>
        </div>
        <DeleteEntityButton
          endpoint={`/api/boreholes/${borehole.id}`}
          confirmMessage={`Ștergeți forajul „${borehole.code}”? Se vor șterge și toate testele din foraj.`}
          redirectTo={`/projects/${borehole.projectId}`}
        />
      </div>

      <div className="card">
        <h2 className="mb-3 font-medium">Editează foraj</h2>
        <EditBoreholeForm
          boreholeId={borehole.id}
          code={borehole.code}
          notes={borehole.notes}
        />
      </div>

      <ElastCsvImport boreholeId={borehole.id} />

      <div className="card">
        <h2 className="mb-3 font-medium">Test gol (fără CSV)</h2>
        <NewTestForm boreholeId={borehole.id} />
        <p className="mt-2 text-xs text-muted">
          Pentru .oyo (JSON migrat) sau CSV cu mapare coloane:{" "}
          <Link href="/import" className="text-accent underline">
            Import
          </Link>
          .
        </p>
      </div>

      <div className="card">
        <h2 className="mb-3 font-medium">Teste</h2>
        {borehole.tests.length === 0 ? (
          <p className="text-sm text-muted">Niciun test.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="py-1">Etichetă</th>
                <th>Stare</th>
                <th>Adâncime</th>
                <th>Sursă</th>
                <th>Actualizat</th>
                <th className="w-24" />
              </tr>
            </thead>
            <tbody>
              {borehole.tests.map((t) => (
                <tr key={t.id} className="border-b border-line/60">
                  <td className="py-2">
                    <Link
                      href={`/tests/${t.id}`}
                      className="font-medium text-accent hover:underline"
                    >
                      {t.label}
                    </Link>
                  </td>
                  <td>
                    {STATUS_LABELS[t.status as TestStatus] ?? t.status}
                  </td>
                  <td>{t.depthM != null ? `${t.depthM} m` : "—"}</td>
                  <td className="text-muted">{t.sourceFileName ?? "manual"}</td>
                  <td className="text-muted">
                    {t.updatedAt.toISOString().slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="py-2 text-right">
                    <DeleteEntityButton
                      endpoint={`/api/tests/${t.id}`}
                      confirmMessage={`Ștergeți testul „${t.label}”?`}
                      redirectTo={`/boreholes/${borehole.id}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
