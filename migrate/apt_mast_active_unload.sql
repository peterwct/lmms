-- =====================================================================
-- apt_mast UNLOAD, ACTIVE RESORTS ONLY (excluding the four whitelisted)
--   ->  migrate/apt_mast_active.txt        (Prisma model: ResortUnit)
-- =====================================================================
-- Run with:  dbaccess <database> apt_mast_active_unload.sql
--
-- *** NOW REDUNDANT BY DEFAULT - 2026-08-11 ***
--   apt_mast_unload.sql gained the same ACTIVE-resort join, so its output
--   already contains everything this script produces. Running this one is
--   harmless (migrate-resort-units.ts de-duplicates on (resortCode, unitNo)
--   and reports the overlap in its summary), but it is no longer required.
--   It is kept for two situations:
--     - topping up units for a newly activated resort without re-running
--       the main export, and
--     - as a cross-check that the main export missed no active resort -
--       both files should list exactly the same resort codes.
--
-- PURPOSE
--   Companion to apt_mast_unload.sql. That script pins an explicit unit
--   whitelist for the four resorts whose registers were trimmed to the
--   live inventory:
--       L-10024 GREENHILL   L-10025 GOLDEN CITY
--       L-10026 LEISURE COVE   CP-PBR PERDANA BEACH
--   This script covers EVERY OTHER resort that is ACTIVE in Informix,
--   in full, so no active resort can be left without its units in LMMS.
--   The status test is driven off resort_mast, not a hardcoded list, so
--   activating a resort in Informix automatically brings its units into
--   the next export - no edit to this script required.
--
-- COLUMN ORDER MUST MATCH apt_mast_unload.sql - prisma/migrate-resort-units.ts
-- reads the file positionally:
--   [0] apt_code  [1] apt_resort_code  [2] apt_rci_reserved
--   [3] apt_unit_type  [4] apt_occupancy
--
-- HOW TO IMPORT
--   The importer reads one file, migrate/apt_mast.txt. Concatenate the
--   two exports before running it (order does not matter; the unique key
--   is (resortCode, unitNo) and the loader uses skipDuplicates):
--       cat apt_mast_active.txt >> apt_mast.txt
--   then:  migrate-table.ps1 -Table ResortUnit
--   Alternatively fold this script's two extra conditions into
--   apt_mast_unload.sql and keep a single apt_mast.txt - see the note at
--   the foot of this file.
-- =====================================================================

UNLOAD TO 'apt_mast_active.txt' DELIMITER '|'
SELECT a.apt_code,
       a.apt_resort_code,
       a.apt_rci_reserved,
       a.apt_unit_type,
       a.apt_occupancy
  FROM apt_mast a, resort_mast r
 WHERE a.apt_resort_code = r.re_resort_code
   AND TRIM(r.re_resort_status) = "A"
   AND a.apt_resort_code NOT IN ("L-10024","L-10025","L-10026","CP-PBR")
 ORDER BY 2, 1;

-- ---------------------------------------------------------------------
-- What to expect
-- ---------------------------------------------------------------------
-- Run this first to see the shape of the result before unloading:
--
--   SELECT a.apt_resort_code, r.re_resort_name, COUNT(*)
--     FROM apt_mast a, resort_mast r
--    WHERE a.apt_resort_code = r.re_resort_code
--      AND TRIM(r.re_resort_status) = "A"
--      AND a.apt_resort_code NOT IN ("L-10024","L-10025","L-10026","CP-PBR")
--    GROUP BY 1, 2 ORDER BY 1;
--
-- The eight resorts already present in LMMS account for 240 rows:
--   L-10016  KEMANG INDAH APARTMENT                  30
--   L-101    SANTANA HOLIDAY RESORT APARTMENTS       10
--   V-CLC1   CLC ENCANTADA                           30
--   V-CLC2   CLC SAN DIEGO SUITES                    40
--   V-LDBR   LOTUS DESARU BEACH RESORT               78
--   V-SGH    GREENHILL RESORT (LVC EXCHANGE)         12
--   V-SGI1   SGI VAC CLUB @ DAMAI LAUT HOLIDAY RST   20
--   V-SGI5   TIMUR BAY SEAFRONT RESIDENCE KUANTAN    20
--
-- ANY OTHER RESORT CODE IN THE OUTPUT IS A GAP THIS SCRIPT JUST CLOSED -
-- an active resort whose units were never migrated. Check each one has a
-- Resort row in LMMS before importing; migrate-resort-units.ts skips a
-- unit whose resort code is unknown, with a "WARN unknown resort" line.
--
-- ---------------------------------------------------------------------
-- Informix and LMMS disagree on which resorts are active - by design
-- ---------------------------------------------------------------------
-- LMMS currently marks 12 of its 324 resorts Active; the resort_mast
-- export of 2026-07-30 had 49 Active (Informix uses A/I, the importer
-- maps I -> U). Staff have since retired resorts through the Resorts
-- Setup screen, and re-importing resort_mast does NOT push those
-- statuses back (migrate-resorts.ts is additive - skipDuplicates, no
-- update), so the two sides drift apart on purpose.
--
-- This script therefore follows the INFORMIX status, and may return
-- resorts that are Inactive in LMMS. Those units still import cleanly
-- (the loader only needs the Resort row to exist, not to be active) and
-- simply sit under an inactive resort, which the unit screen's resort
-- dropdown will not offer. To follow the LMMS status instead, replace
-- the status test with the explicit list of LMMS-active resorts:
--
--   AND a.apt_resort_code IN ("L-10016","L-101","V-CLC1","V-CLC2",
--                             "V-LDBR","V-SGH","V-SGI1","V-SGI5")
--
-- ---------------------------------------------------------------------
-- Single-file alternative
-- ---------------------------------------------------------------------
-- To produce ONE apt_mast.txt instead of two files, drop this script and
-- add to apt_mast_unload.sql: join resort_mast on the resort code, add
--   AND TRIM(re_resort_status) = "A"
-- to the whole WHERE clause, and keep the four whitelists as they are.
-- Same result, no concatenation step.
-- ---------------------------------------------------------------------
