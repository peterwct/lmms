-- SeasonPoint: replace year-keyed charts with effective-dated VERSIONS.
--
-- A chart is now all rows sharing (resortCode, effectiveDate); it stays in force until a
-- later version supersedes it, so staff no longer re-key a grid every year. One effective
-- date per resort per version replaces the old per-apartment-type/season date.
--
-- The `year` column was almost pure duplication: 1,062 resort-years held only 303
-- chronologically distinct charts, and five active resorts had re-keyed an identical chart
-- 24 years running. `effectiveDate` was already being used as a per-room-type "rate set on"
-- stamp in 226 of 265 resorts, not as a per-year value.
--
-- Superseded history is dropped by business decision — fn 9 is the only consumer of this
-- table, there is no booking module yet, and history accumulates from here on.

-- 1. Keep only each resort's latest year. 4,766 rows -> 1,209 across 265 resorts.
DELETE FROM "SeasonPoint" s
USING (SELECT "resortCode", max("year") AS y FROM "SeasonPoint" GROUP BY 1) mx
WHERE s."resortCode" = mx."resortCode" AND s."year" <> mx.y;

-- 2. Collapse the surviving per-room-type dates to one date per resort: the date the last
--    component of that chart changed. Derived from real data, nothing invented.
UPDATE "SeasonPoint" s
SET "effectiveDate" = m.eff
FROM (SELECT "resortCode", max("effectiveDate") AS eff FROM "SeasonPoint" GROUP BY 1) m
WHERE s."resortCode" = m."resortCode";

-- 3. Re-key. Verified before writing this migration: the 1,209 surviving rows contain
--    1,209 distinct (resortCode, apartmentType, season), so the new unique index builds
--    with zero collisions.
DROP INDEX "SeasonPoint_natkey_key";
DROP INDEX "SeasonPoint_resortCode_year_idx";

ALTER TABLE "SeasonPoint" DROP COLUMN "year";

CREATE UNIQUE INDEX "SeasonPoint_natkey_key"
  ON "SeasonPoint"("resortCode", "effectiveDate", "apartmentType", "season");
CREATE INDEX "SeasonPoint_resortCode_effectiveDate_idx"
  ON "SeasonPoint"("resortCode", "effectiveDate");
