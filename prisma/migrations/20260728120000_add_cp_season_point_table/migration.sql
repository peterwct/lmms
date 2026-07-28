-- CreateTable
CREATE TABLE "CpSeasonPoint" (
    "id" TEXT NOT NULL,
    "resortId" TEXT NOT NULL,
    "resortCode" TEXT NOT NULL,
    "apartmentType" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "season" TEXT NOT NULL,
    "ptsSun" INTEGER NOT NULL,
    "ptsMon" INTEGER NOT NULL,
    "ptsTue" INTEGER NOT NULL,
    "ptsWed" INTEGER NOT NULL,
    "ptsThu" INTEGER NOT NULL,
    "ptsFri" INTEGER NOT NULL,
    "ptsSat" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CpSeasonPoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Mirrors Informix u925_83. Named explicitly (schema.prisma uses map:) because the
-- generated name would exceed PostgreSQL's 63-char identifier limit and be truncated.
CREATE UNIQUE INDEX "CpSeasonPoint_natkey_key" ON "CpSeasonPoint"("resortCode", "apartmentType", "year", "effectiveDate", "season");

-- CreateIndex
CREATE INDEX "CpSeasonPoint_resortCode_year_idx" ON "CpSeasonPoint"("resortCode", "year");

-- AddForeignKey
ALTER TABLE "CpSeasonPoint" ADD CONSTRAINT "CpSeasonPoint_resortId_fkey" FOREIGN KEY ("resortId") REFERENCES "Resort"("id") ON DELETE CASCADE ON UPDATE CASCADE;
