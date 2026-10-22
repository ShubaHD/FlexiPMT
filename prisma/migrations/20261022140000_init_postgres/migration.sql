-- CreateTable
CREATE TABLE "LabSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "companyName" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "phone" TEXT,
    "email" TEXT,
    "accreditation" TEXT,
    "logoDataUrl" TEXT,
    "preparedBy" TEXT,
    "verifiedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "site" TEXT,
    "client" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Borehole" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Borehole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmtTest" (
    "id" TEXT NOT NULL,
    "boreholeId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "depthM" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "author" TEXT,
    "testDate" TEXT,
    "sourceFileName" TEXT,
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "historyJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PmtTest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

-- CreateIndex
CREATE INDEX "PmtTest_boreholeId_idx" ON "PmtTest"("boreholeId");

-- CreateIndex
CREATE UNIQUE INDEX "Borehole_projectId_code_key" ON "Borehole"("projectId", "code");

-- AddForeignKey
ALTER TABLE "Borehole" ADD CONSTRAINT "Borehole_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmtTest" ADD CONSTRAINT "PmtTest_boreholeId_fkey" FOREIGN KEY ("boreholeId") REFERENCES "Borehole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
