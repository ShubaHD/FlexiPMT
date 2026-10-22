import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { DeleteEntityButton } from "@/components/delete-entity-button";
import { EditProjectForm } from "./edit-project-form";
import { NewBoreholeForm } from "./new-borehole-form";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      boreholes: {
        orderBy: { code: "asc" },
        include: { tests: { orderBy: { createdAt: "asc" } } },
      },
    },
  });
  if (!project) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm text-muted">Proiect</div>
          <h1 className="font-[family-name:var(--font-dm)] text-2xl font-semibold">
            {project.code} — {project.name}
          </h1>
          {(project.site || project.client) && (
            <p className="text-sm text-muted">
              {[project.site, project.client].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <DeleteEntityButton
          endpoint={`/api/projects/${project.id}`}
          confirmMessage={`Ștergeți proiectul „${project.code}”? Se vor șterge și toate forajele și testele asociate.`}
          redirectTo="/projects"
        />
      </div>

      <div className="card">
        <h2 className="mb-3 font-medium">Editează proiect</h2>
        <EditProjectForm
          projectId={project.id}
          code={project.code}
          name={project.name}
          site={project.site}
          client={project.client}
        />
      </div>

      <div className="card">
        <h2 className="mb-3 font-medium">Foraj nou</h2>
        <NewBoreholeForm projectId={project.id} />
      </div>

      <div className="card">
        <h2 className="mb-3 font-medium">Foraje</h2>
        {project.boreholes.length === 0 ? (
          <p className="text-sm text-muted">Niciun foraj.</p>
        ) : (
          <ul className="space-y-3">
            {project.boreholes.map((b) => (
              <li key={b.id} className="rounded border border-line p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Link
                    href={`/boreholes/${b.id}`}
                    className="font-medium text-accent hover:underline"
                  >
                    {b.code}
                  </Link>
                  <DeleteEntityButton
                    endpoint={`/api/boreholes/${b.id}`}
                    confirmMessage={`Ștergeți forajul „${b.code}”? Se vor șterge și toate testele din foraj.`}
                    redirectTo={`/projects/${project.id}`}
                  />
                </div>
                <div className="mt-1 text-sm text-muted">
                  {b.tests.length} test(e)
                  {b.tests.length > 0 && (
                    <ul className="ml-4 list-disc">
                      {b.tests.map((t) => (
                        <li key={t.id}>
                          <Link href={`/tests/${t.id}`} className="hover:underline">
                            {t.label} ({t.status})
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
