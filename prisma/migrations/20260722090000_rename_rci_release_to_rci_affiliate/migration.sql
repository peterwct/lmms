-- Rename Resort.rciRelease -> rciAffiliate (data-preserving; Prisma's default
-- diff would DROP + ADD and lose the migrated values).
ALTER TABLE "Resort" RENAME COLUMN "rciRelease" TO "rciAffiliate";

-- Business data fix: mark GC (GOLDEN CITY CONDOMINIUM) and LDBR (LOTUS DESARU
-- BEACH RESORT) as RCI-affiliated.
UPDATE "Resort" SET "rciAffiliate" = 'Y', "updatedAt" = NOW() WHERE "shortName" IN ('GC', 'LDBR');
