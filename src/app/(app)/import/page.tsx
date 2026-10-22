import { prisma } from "@/lib/db";
import { ImportClient } from "./import-client";

export default async function ImportPage() {
  const boreholes = await prisma.borehole.findMany({
    orderBy: { code: "asc" },
    include: { project: { select: { code: true, name: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-dm)] text-2xl font-semibold">
          Import
        </h1>
        <p className="text-sm text-muted">
          CSV Elast: cel mai simplu pe pagina forajului sau direct pe test.
          .oyo → migrare Python (pickle) → JSON. Fișierele originale nu sunt
          modificate.
        </p>
      </div>
      <ImportClient
        boreholes={boreholes.map((b) => ({
          id: b.id,
          label: `${b.project.code} / ${b.code}`,
        }))}
      />
    </div>
  );
}
