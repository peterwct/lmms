-- =====================================================================
-- apt_mast UNLOAD  ->  migrate/apt_mast.txt   (Prisma model: ResortUnit)
-- =====================================================================
-- Run with:  dbaccess <database> apt_mast_unload.sql
--
-- Deliberately a PARTIAL export: 5 of the 15 apt_mast columns.
-- The date / audit / lock_status columns are not migrated (business
-- decision, same as every other table in this project).
--
-- Column order below MUST stay as-is - prisma/migrate-resort-units.ts
-- reads it positionally:
--   [0] apt_code          -> ResortUnit.unitNo         (e.g. A1, 3227/3228, 1.12A)
--   [1] apt_resort_code   -> ResortUnit.resortCode
--   [2] apt_rci_reserved  -> ResortUnit.rciReserved    (Y/N)
--   [3] apt_unit_type     -> ResortUnit.apartmentType  (must exist in ApartmentType)
--   [4] apt_occupancy     -> ResortUnit.occupancy
--
-- =====================================================================
-- TWO FILTERS, BOTH REQUIRED
-- =====================================================================
-- 1. ACTIVE RESORTS ONLY (re_resort_status = "A" in resort_mast)
--    LMMS only maintains the live resort estate. Without this join the
--    export carries every resort ever recorded - 12,047 rows across 316
--    resorts, of which 11,689 belong to 304 RETIRED resorts. Those rows
--    import fine but bury the Apartments/Units screen, which does not
--    filter by resort status. Added 2026-08-11 after exactly that
--    happened on a full re-migrate.
--    The status lives in resort_mast, so a resort retired in Informix
--    drops out of the next export automatically - and one reactivated
--    comes back in. No edit to this script required.
--
-- 2. LIVE UNIT REGISTER for four resorts
--    apt_mast still carries decades of retired unit numbers. The business
--    supplied the authoritative list of units that physically exist today;
--    the retired rows were deleted from ResortUnit and are filtered out
--    here so a re-import (migrate-table.ps1 -Table ResortUnit / -Table
--    Resort / refresh-test-db.ps1, all of which TRUNCATE and reimport)
--    cannot bring them back.
--
--      L-10024  GREENHILL RESORT         34 of 61 kept   (A1..A34)
--      L-10025  GOLDEN CITY CONDOMINIUM  22 of 42 kept   (B1..B22)
--      L-10026  LEISURE COVE             14 of 49 kept   (floors 4 and 5)
--      CP-PBR   PERDANA SERVICE APT      48 of 283 kept  (the 32xx family)
--
--    Every other ACTIVE resort exports in full. In particular L-10016
--    KEMANG INDAH (30 units) and L-101 SANTANA (10 units) are already
--    exactly the live register, so they are deliberately NOT whitelisted -
--    a list there would add no protection and only risks a typo dropping
--    a good unit.
--
--    CP-PBR is lock-on/lock-off: each apartment is THREE rows - the odd
--    number is the SLEEP4 half, the even number the SLEEP2 half and the
--    compound code the combined SLEEP6 unit (3201 + 3202 + 3201/3202).
--    All three are live inventory, so the whitelist lists all 48 codes,
--    not just the 16 combined ones.
--
-- The same four whitelists appear in apt_block_unload.sql and
-- resmt_unload.sql. *** KEEP ALL THREE FILES IN SYNC. ***
-- Explicit code lists are used on purpose rather than a pattern such as
-- MATCHES "32*" - a pattern would silently readmit a future unit number.
-- =====================================================================

UNLOAD TO 'apt_mast.txt' DELIMITER '|'
SELECT a.apt_code,
       a.apt_resort_code,
       a.apt_rci_reserved,
       a.apt_unit_type,
       a.apt_occupancy
  FROM apt_mast a, resort_mast r
 WHERE a.apt_resort_code = r.re_resort_code
   AND TRIM(r.re_resort_status) = "A"
   AND ( a.apt_resort_code NOT IN ("L-10024","L-10025","L-10026","CP-PBR")

    -- GREENHILL RESORT: A1..A34
    OR (a.apt_resort_code = "L-10024" AND TRIM(a.apt_code) IN (
        "A1" ,"A2" ,"A3" ,"A4" ,"A5" ,"A6" ,"A7" ,"A8" ,"A9" ,"A10",
        "A11","A12","A13","A14","A15","A16","A17","A18","A19","A20",
        "A21","A22","A23","A24","A25","A26","A27","A28","A29","A30",
        "A31","A32","A33","A34"))

    -- GOLDEN CITY CONDOMINIUM: B1..B22
    OR (a.apt_resort_code = "L-10025" AND TRIM(a.apt_code) IN (
        "B1" ,"B2" ,"B3" ,"B4" ,"B5" ,"B6" ,"B7" ,"B8" ,"B9" ,"B10",
        "B11","B12","B13","B14","B15","B16","B17","B18","B19","B20",
        "B21","B22"))

    -- LEISURE COVE: floors 4 and 5 only
    OR (a.apt_resort_code = "L-10026" AND TRIM(a.apt_code) IN (
        "401","402","404","406","407","408","410",
        "501","502","504","506","507","508","510"))

    -- PERDANA SERVICE APARTMENT & RESORT: 16 apartments x 3 lock-on/off rows
    OR (a.apt_resort_code = "CP-PBR" AND TRIM(a.apt_code) IN (
        "3201","3202","3201/3202",  "3203","3204","3203/3204",
        "3205","3206","3205/3206",  "3207","3208","3207/3208",
        "3209","3210","3209/3210",  "3211","3212","3211/3212",
        "3213","3214","3213/3214",  "3215","3216","3215/3216",
        "3217","3218","3217/3218",  "3219","3220","3219/3220",
        "3221","3222","3221/3222",  "3223","3224","3223/3224",
        "3225","3226","3225/3226",  "3227","3228","3227/3228",
        "3229","3230","3229/3230",  "3231","3232","3231/3232")) );

-- ---------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------
-- Expect 358 rows over the 12 active resorts:
--   CP-PBR   48    L-10016  30    L-10024  34    L-10025  22
--   L-10026  14    L-101    10    V-CLC1   30    V-CLC2   40
--   V-LDBR   78    V-SGH    12    V-SGI1   20    V-SGI5   20
--
-- After copying apt_mast.txt to E:\Websites\lmms\migrate\ :
--   wc -l < apt_mast.txt                             -> 358
--   awk -F'|' '$2=="CP-PBR"'  apt_mast.txt | wc -l   ->  48
--   awk -F'|' '$2=="L-10024"' apt_mast.txt | wc -l   ->  34
--   awk -F'|' '$2=="L-10025"' apt_mast.txt | wc -l   ->  22
--   awk -F'|' '$2=="L-10026"' apt_mast.txt | wc -l   ->  14
--
-- V-CLC2 exports 40 rows but loads 30: ten of its apt_codes are the same
-- code re-entered with leading spaces (right-aligned "     1-6" vs "1-6")
-- and a mismatched SLEEP4 type. migrate-resort-units.ts trims and keeps
-- the first, and reports them as "duplicate" in its summary.
-- ---------------------------------------------------------------------
