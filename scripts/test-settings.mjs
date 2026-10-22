import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
try {
  const r = await p.labSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      companyName: "Test Co",
      preparedBy: "A",
      verifiedBy: "B",
    },
    update: {
      companyName: "Test Co",
      preparedBy: "A",
      verifiedBy: "B",
    },
  });
  console.log("OK", {
    id: r.id,
    preparedBy: r.preparedBy,
    verifiedBy: r.verifiedBy,
    hasLogo: Boolean(r.logoDataUrl),
  });
} catch (e) {
  console.error("ERR", e.message);
  console.error(e);
} finally {
  await p.$disconnect();
}
