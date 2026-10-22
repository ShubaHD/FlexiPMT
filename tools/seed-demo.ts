/**
 * Seed proiect demonstrativ FlexiPMT din fixtures/reference/000|001ELAST.CSV.
 *
 * - Nu modifică fișierele CSV.
 * - Nu inventează ν, L celulă, limită aparat, interval fit sau ps.
 * - Nu atașează KP/GA la calcul.
 * - Nu suprascrie teste existente: le reutilizează dacă sunt deja în DEMO,
 *   altfel creează teste noi clar marcate DEMO.
 *
 * Rulare: npx tsx tools/seed-demo.ts
 */

import { readFileSync, existsSync } from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { parseElastLoggerCsv } from "../src/lib/import/elast-csv";
import {
  emptyPayload,
  missingRequiredFields,
  rawToWorking,
} from "../src/lib/schema/pmt-v1";
import { parsePayload, pushHistory, recomputePayload } from "../src/lib/payload";

const prisma = new PrismaClient();

const PROJECT_CODE = "DEMO-FLEXIPMT";
const PROJECT_NAME = "DEMO – FlexiPMT";
const BOREHOLE_CODE = "60785";

const FIXTURES = [
  {
    fileName: "000ELAST.CSV",
    expectedDepthM: 19.0,
    label: "DEMO — 19,0 m (000ELAST.CSV)",
  },
  {
    fileName: "001ELAST.CSV",
    expectedDepthM: 21.0,
    label: "DEMO — 21,0 m (001ELAST.CSV)",
  },
] as const;

function loadFixture(fileName: string): string {
  const p = path.join(process.cwd(), "fixtures", "reference", fileName);
  if (!existsSync(p)) {
    throw new Error(`Lipsește fixtures/reference/${fileName}`);
  }
  return readFileSync(p, "utf-8");
}

function buildImportedPayload(csvText: string, fileName: string) {
  const parsed = parseElastLoggerCsv(csvText, fileName);
  let payload = emptyPayload();
  payload.rawPoints = parsed.rawPoints.map((pt) => ({ ...pt }));
  payload.workingPoints = rawToWorking(parsed.rawPoints);
  payload.importSummary = parsed.summary;
  payload.elastMeta = parsed.metadata;
  payload.testFactors = parsed.metadata.factors;
  payload.rowIssues = parsed.rowIssues;
  payload.originalCsvText = parsed.originalText;
  payload.calibration.correctionsAlreadyApplied = true;
  payload.calibration.notes =
    "DEMO: Import Elast — Pressure/dRi/R nemodificate; ΔV calculat de FlexiPMT. Fără KP/GA. Fără valori inventate pentru ν / L / limită / fit / ps.";
  // requiredInputs rămân null / false → raport incomplete
  payload.reportStatus = "incomplete";

  const out = recomputePayload(payload);
  return { parsed, payload: out.payload, missingRequired: out.missingRequired };
}

async function main() {
  const project = await prisma.project.upsert({
    where: { code: PROJECT_CODE },
    create: {
      code: PROJECT_CODE,
      name: PROJECT_NAME,
      site: "Demonstrație FlexiPMT — Hole 60785 (fixtures/reference)",
      client: "DEMO",
      notes:
        "Proiect demonstrativ. Date din 000ELAST.CSV și 001ELAST.CSV. Rapoartele rămân incomplete până la completarea ν, L celulă, limită aparat, interval fit și ps.",
    },
    update: {
      name: PROJECT_NAME,
      site: "Demonstrație FlexiPMT — Hole 60785 (fixtures/reference)",
      client: "DEMO",
      notes:
        "Proiect demonstrativ. Date din 000ELAST.CSV și 001ELAST.CSV. Rapoartele rămân incomplete până la completarea ν, L celulă, limită aparat, interval fit și ps.",
    },
  });

  let borehole = await prisma.borehole.findFirst({
    where: { projectId: project.id, code: BOREHOLE_CODE },
  });
  if (!borehole) {
    borehole = await prisma.borehole.create({
      data: {
        projectId: project.id,
        code: BOREHOLE_CODE,
        notes: "Foraj demonstrativ — Hole No. din CSV-urile Elast de referință.",
      },
    });
  }

  const results: {
    fileName: string;
    testId: string;
    label: string;
    depthM: number | null;
    action: "reused" | "created";
    points: number;
    missingRequired: string[];
    reportStatus: string | undefined;
  }[] = [];

  for (const fixture of FIXTURES) {
    const csvText = loadFixture(fixture.fileName);
    const existing = await prisma.pmtTest.findFirst({
      where: {
        boreholeId: borehole.id,
        sourceFileName: fixture.fileName,
      },
      orderBy: { createdAt: "asc" },
    });

    if (existing) {
      const parsedPayload = parsePayload(existing.payloadJson);
      results.push({
        fileName: fixture.fileName,
        testId: existing.id,
        label: existing.label,
        depthM: existing.depthM,
        action: "reused",
        points: parsedPayload.workingPoints.length,
        missingRequired: missingRequiredFields(parsedPayload),
        reportStatus: parsedPayload.reportStatus,
      });
      continue;
    }

    const { parsed, payload, missingRequired } = buildImportedPayload(
      csvText,
      fixture.fileName
    );

    if (
      parsed.metadata.depthM != null &&
      Math.abs(parsed.metadata.depthM - fixture.expectedDepthM) > 0.05
    ) {
      throw new Error(
        `${fixture.fileName}: adâncime CSV ${parsed.metadata.depthM} ≠ așteptat ${fixture.expectedDepthM}`
      );
    }

    const history = pushHistory(
      [],
      "import",
      `Seed DEMO: import ${fixture.fileName}; ${parsed.rawPoints.length} puncte; Data size=${parsed.metadata.dataSize ?? "?"}; raport incomplete (fără date inventate).`,
      "seed-demo"
    );

    const test = await prisma.pmtTest.create({
      data: {
        boreholeId: borehole.id,
        label: fixture.label,
        depthM: parsed.metadata.depthM ?? fixture.expectedDepthM,
        status: "IMPORTED",
        author: "seed-demo",
        testDate: parsed.metadata.testDate ?? null,
        sourceFileName: fixture.fileName,
        payloadJson: JSON.stringify(payload),
        historyJson: JSON.stringify(history),
      },
    });

    results.push({
      fileName: fixture.fileName,
      testId: test.id,
      label: test.label,
      depthM: test.depthM,
      action: "created",
      points: parsed.rawPoints.length,
      missingRequired,
      reportStatus: payload.reportStatus,
    });
  }

  console.log(
    JSON.stringify(
      {
        project: {
          id: project.id,
          code: project.code,
          name: project.name,
          url: `/projects/${project.id}`,
        },
        borehole: {
          id: borehole.id,
          code: borehole.code,
          url: `/boreholes/${borehole.id}`,
        },
        tests: results.map((r) => ({
          ...r,
          url: `/tests/${r.testId}`,
          reportUrl: `/tests/${r.testId}/report`,
        })),
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
