import Link from "next/link";
import { prisma } from "@/lib/db";
import { DeleteEntityButton } from "@/components/delete-entity-button";
import { NewProjectForm } from "./new-project-form";

export default async function ProjectsPage() {
  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      boreholes: { include: { _count: { select: { tests: true } } } },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-dm)] text-2xl font-semibold">
          Proiecte
        </h1>
        <p className="text-sm text-muted">
          Proiect → Foraj → Test presiometric OYO
        </p>
      </div>

      <div className="card">
        <h2 className="mb-3 font-medium">Proiect nou</h2>
        <NewProjectForm />
      </div>

      <div className="card">
        <h2 className="mb-3 font-medium">Lista proiecte</h2>
        {projects.length === 0 ? (
          <p className="text-sm text-muted">Niciun proiect încă.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="py-1">Cod</th>
                <th>Denumire</th>
                <th>Foraje</th>
                <th>Teste</th>
                <th className="w-24" />
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const tests = p.boreholes.reduce(
                  (n, b) => n + b._count.tests,
                  0
                );
                return (
                  <tr key={p.id} className="border-b border-line/60">
                    <td className="py-2">
                      <Link
                        href={`/projects/${p.id}`}
                        className="font-medium text-accent hover:underline"
                      >
                        {p.code}
                      </Link>
                    </td>
                    <td>{p.name}</td>
                    <td>{p.boreholes.length}</td>
                    <td>{tests}</td>
                    <td className="py-2 text-right">
                      <DeleteEntityButton
                        endpoint={`/api/projects/${p.id}`}
                        confirmMessage={`Ștergeți proiectul „${p.code}”? Se vor șterge și toate forajele și testele asociate.`}
                        redirectTo="/projects"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
