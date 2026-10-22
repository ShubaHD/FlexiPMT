"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tree = {
  id: string;
  code: string;
  name: string;
  boreholes: {
    id: string;
    code: string;
    tests: { id: string; label: string; status: string }[];
  }[];
}[];

export function ExplorerClient({ projects }: { projects: Tree }) {
  const pathname = usePathname();

  return (
    <aside className="app-shell-explorer flex w-60 shrink-0 flex-col overflow-auto border-r border-line bg-sidebar p-3 text-sm">
      <Link
        href="/projects"
        className={`mb-2 block text-xs font-semibold uppercase tracking-wide ${
          pathname === "/projects" || pathname.startsWith("/projects/")
            ? "text-accent"
            : "text-muted hover:text-ink"
        }`}
      >
        Proiecte
      </Link>
      {projects.length === 0 && (
        <p className="text-muted">Niciun proiect. Creați unul din Proiecte.</p>
      )}
      <ul className="space-y-2">
        {projects.map((p) => (
          <li key={p.id}>
            <Link
              href={`/projects/${p.id}`}
              className={`block rounded px-1.5 py-0.5 font-medium ${
                pathname.includes(p.id) ? "bg-accent-soft text-accent" : "hover:bg-white"
              }`}
            >
              {p.code}
            </Link>
            <ul className="ml-2 mt-1 space-y-1 border-l border-line pl-2">
              {p.boreholes.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/boreholes/${b.id}`}
                    className="block text-muted hover:text-ink"
                  >
                    {b.code}
                  </Link>
                  <ul className="ml-2 space-y-0.5">
                    {b.tests.map((t) => (
                      <li key={t.id}>
                        <Link
                          href={`/tests/${t.id}`}
                          className={`block truncate ${
                            pathname === `/tests/${t.id}`
                              ? "font-medium text-accent"
                              : "text-muted hover:text-ink"
                          }`}
                        >
                          {t.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </aside>
  );
}
