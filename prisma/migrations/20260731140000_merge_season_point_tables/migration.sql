-- Merge CpSeasonPoint (home resorts) + LvcSeasonPoint (non-home resorts) into one
-- SeasonPoint table discriminated by pointsType.
--
-- Row ids are preserved so existing AuditLog entries still refer to a real record
-- (their targetType stays 'CpSeasonPoint'/'LvcSeasonPoint' — history is not rewritten).
--
-- Safe because the two datasets are disjoint: CP-PBR appears in 0 ps_lvcapt rows, 0 LVC
-- rows carry coCode '02', and the shared natural key collides 0 times across all 4,766 rows.

-- CreateTable
CREATE TABLE "SeasonPoint" (
    "id" TEXT NOT NULL,
    "pointsType" TEXT NOT NULL,
    "resortId" TEXT NOT NULL,
    "resortCode" TEXT NOT NULL,
    "coCode" TEXT NOT NULL,
    "lvcCoCode" TEXT,
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

    CONSTRAINT "SeasonPoint_pkey" PRIMARY KEY ("id")
);

-- HOME rows: CpSeasonPoint never stored coCode, so join Resort for it. lvcCoCode stays NULL.
INSERT INTO "SeasonPoint" (
    "id","pointsType","resortId","resortCode","coCode","lvcCoCode","apartmentType",
    "year","effectiveDate","season",
    "ptsSun","ptsMon","ptsTue","ptsWed","ptsThu","ptsFri","ptsSat","createdAt","updatedAt")
SELECT c."id", 'HOME', c."resortId", c."resortCode", r."coCode", NULL, c."apartmentType",
       c."year", c."effectiveDate", c."season",
       c."ptsSun", c."ptsMon", c."ptsTue", c."ptsWed", c."ptsThu", c."ptsFri", c."ptsSat",
       c."createdAt", c."updatedAt"
FROM "CpSeasonPoint" c
JOIN "Resort" r ON r."id" = c."resortId";

-- AWAY rows: LvcSeasonPoint already carries both coCode columns.
INSERT INTO "SeasonPoint" (
    "id","pointsType","resortId","resortCode","coCode","lvcCoCode","apartmentType",
    "year","effectiveDate","season",
    "ptsSun","ptsMon","ptsTue","ptsWed","ptsThu","ptsFri","ptsSat","createdAt","updatedAt")
SELECT l."id", 'AWAY', l."resortId", l."resortCode", l."coCode", l."lvcCoCode", l."apartmentType",
       l."year", l."effectiveDate", l."season",
       l."ptsSun", l."ptsMon", l."ptsTue", l."ptsWed", l."ptsThu", l."ptsFri", l."ptsSat",
       l."createdAt", l."updatedAt"
FROM "LvcSeasonPoint" l;

-- DropTable
DROP TABLE "CpSeasonPoint";
DROP TABLE "LvcSeasonPoint";

-- CreateIndex
CREATE UNIQUE INDEX "SeasonPoint_natkey_key" ON "SeasonPoint"("resortCode", "apartmentType", "year", "effectiveDate", "season");

-- CreateIndex
CREATE INDEX "SeasonPoint_resortCode_year_idx" ON "SeasonPoint"("resortCode", "year");

-- AddForeignKey
ALTER TABLE "SeasonPoint" ADD CONSTRAINT "SeasonPoint_resortId_fkey" FOREIGN KEY ("resortId") REFERENCES "Resort"("id") ON DELETE CASCADE ON UPDATE CASCADE;
