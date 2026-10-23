import { AppHeader } from "@/components/app-header";
import { ExplorerClient } from "@/components/explorer";
import { prisma } from "@/lib/db";

/** Datele din DB trebuie citite la fiecare request (nu cache static gol) */
export const dynamic = "force-dynamic";

export default async function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const projects = await prisma.project.findMany({
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      boreholes: {
        orderBy: { code: "asc" },
        select: {
          id: true,
          code: true,
          tests: {
            orderBy: { createdAt: "asc" },
            select: { id: true, label: true, status: true },
          },
        },
      },
    },
  });

  return (
    <div className="flex h-screen flex-col">
      <div className="app-shell-header no-print">
        <AppHeader />
      </div>
      <div className="flex min-h-0 flex-1">
        <ExplorerClient projects={projects} />
        <main className="app-shell-main min-w-0 flex-1 overflow-auto bg-bg p-5">
          {children}
        </main>
      </div>
    </div>
  );
}
