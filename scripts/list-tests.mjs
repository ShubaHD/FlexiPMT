import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const rows = await p.pmtTest.findMany({
  take: 10,
  select: { id: true, label: true, status: true },
});
console.log(JSON.stringify(rows, null, 2));
await p.$disconnect();
