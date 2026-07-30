-- CreateTable
CREATE TABLE "LvcSeasonPoint" (
    "id" TEXT NOT NULL,
    "resortId" TEXT NOT NULL,
    "resortCode" TEXT NOT NULL,
    "coCode" TEXT NOT NULL,
    "apartmentType" TEXT NOT NULL,
    "lvcCoCode" TEXT NOT NULL DEFAULT '02',
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

    CONSTRAINT "LvcSeasonPoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Same shape as CpSeasonPoint_natkey_key. Named explicitly (schema.prisma uses map:)
-- because the generated name would exceed PostgreSQL's 63-char identifier limit.
CREATE UNIQUE INDEX "LvcSeasonPoint_natkey_key" ON "LvcSeasonPoint"("resortCode", "apartmentType", "year", "effectiveDate", "season");

-- CreateIndex
CREATE INDEX "LvcSeasonPoint_resortCode_year_idx" ON "LvcSeasonPoint"("resortCode", "year");

-- AddForeignKey
ALTER TABLE "LvcSeasonPoint" ADD CONSTRAINT "LvcSeasonPoint_resortId_fkey" FOREIGN KEY ("resortId") REFERENCES "Resort"("id") ON DELETE CASCADE ON UPDATE CASCADE;
