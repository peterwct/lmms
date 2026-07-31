-- Merge PublicHoliday + SchoolHoliday into a single Holiday table.
-- Row ids are preserved so existing AuditLog entries still refer to a real record
-- (their targetType stays 'PublicHoliday'/'SchoolHoliday' — history is not rewritten).

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "holidayType" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "year" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- Carry existing rows over: public holidays are single-day (endDate NULL)
INSERT INTO "Holiday" ("id","holidayType","startDate","endDate","year","description","createdAt","updatedAt")
SELECT "id", 'PUBLIC', "holidayDate", NULL, "year", "description", "createdAt", "updatedAt"
FROM "PublicHoliday";

-- School holidays are ranges; academicYear becomes year
INSERT INTO "Holiday" ("id","holidayType","startDate","endDate","year","description","createdAt","updatedAt")
SELECT "id", 'SCHOOL', "startDate", "endDate", "academicYear", "description", "createdAt", "updatedAt"
FROM "SchoolHoliday";

-- DropTable
DROP TABLE "PublicHoliday";
DROP TABLE "SchoolHoliday";

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_holidayType_startDate_description_key" ON "Holiday"("holidayType", "startDate", "description");

-- CreateIndex
CREATE INDEX "Holiday_holidayType_year_idx" ON "Holiday"("holidayType", "year");
