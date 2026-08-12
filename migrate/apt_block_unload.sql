-- =====================================================================
-- apt_block UNLOAD  ->  migrate/apt_block.txt   (Prisma model: AptBlock)
-- =====================================================================
-- Run with:  dbaccess <database> apt_block_unload.sql
--
-- Full-row export (SELECT *, 10 columns); prisma/migrate-apt-block.ts
-- reads only [0..4] positionally and ignores the trailer:
--   [0] resort_code -> AptBlock.resortCode
--   [1] apt_code    -> AptBlock.unitNo     (incl. compound codes "3005/3006")
--   [2] start_date  -> AptBlock.startDate  (dd-mm-yyyy)
--   [3] end_date    -> AptBlock.endDate    (dd-mm-yyyy)
--   [4] block_no    -> AptBlock.blockNo
--   [5..9] create-user / create-date / 'new' / blank / lock_status  NOT migrated
--
-- =====================================================================
-- TWO FILTERS, BOTH REQUIRED - MUST MATCH apt_mast_unload.sql
-- =====================================================================
-- 1. ACTIVE RESORTS ONLY (re_resort_status = "A" in resort_mast)
--    Blocks must not outlive the unit register. apt_mast_unload.sql
--    exports units for ACTIVE resorts only, so a block on a retired
--    resort would reference a unit that no longer exists - it imports
--    with a null apartmentType and clutters the Units Availability
--    screen, which does not filter by resort status. Without this join
--    the export is 25,266 rows, of which 20,104 are on retired resorts.
--    Added 2026-08-11.
--
-- 2. LIVE UNIT REGISTER for four resorts - the same whitelist as
--    apt_mast_unload.sql:
--      L-10024 GREENHILL A1-A34      L-10025 GOLDEN CITY B1-B22
--      L-10026 LEISURE COVE fl 4-5   CP-PBR PERDANA the 32xx family
--
-- *** KEEP THIS WHITELIST IN SYNC WITH apt_mast_unload.sql AND
-- resmt_unload.sql. ***
-- =====================================================================

UNLOAD TO 'apt_block.txt' DELIMITER '|'
SELECT b.*
  FROM apt_block b, resort_mast r
 WHERE b.resort_code = r.re_resort_code
   AND TRIM(r.re_resort_status) = "A"
   AND ( b.resort_code NOT IN ("L-10024","L-10025","L-10026","CP-PBR")

    -- GREENHILL RESORT: A1..A34
    OR (b.resort_code = "L-10024" AND TRIM(b.apt_code) IN (
        "A1" ,"A2" ,"A3" ,"A4" ,"A5" ,"A6" ,"A7" ,"A8" ,"A9" ,"A10",
        "A11","A12","A13","A14","A15","A16","A17","A18","A19","A20",
        "A21","A22","A23","A24","A25","A26","A27","A28","A29","A30",
        "A31","A32","A33","A34"))

    -- GOLDEN CITY CONDOMINIUM: B1..B22
    OR (b.resort_code = "L-10025" AND TRIM(b.apt_code) IN (
        "B1" ,"B2" ,"B3" ,"B4" ,"B5" ,"B6" ,"B7" ,"B8" ,"B9" ,"B10",
        "B11","B12","B13","B14","B15","B16","B17","B18","B19","B20",
        "B21","B22"))

    -- LEISURE COVE: floors 4 and 5 only
    OR (b.resort_code = "L-10026" AND TRIM(b.apt_code) IN (
        "401","402","404","406","407","408","410",
        "501","502","504","506","507","508","510"))

    -- PERDANA SERVICE APARTMENT & RESORT: 16 apartments x 3 lock-on/off rows
    OR (b.resort_code = "CP-PBR" AND TRIM(b.apt_code) IN (
        "3201","3202","3201/3202",  "3203","3204","3203/3204",
        "3205","3206","3205/3206",  "3207","3208","3207/3208",
        "3209","3210","3209/3210",  "3211","3212","3211/3212",
        "3213","3214","3213/3214",  "3215","3216","3215/3216",
        "3217","3218","3217/3218",  "3219","3220","3219/3220",
        "3221","3222","3221/3222",  "3223","3224","3223/3224",
        "3225","3226","3225/3226",  "3227","3228","3227/3228",
        "3229","3230","3229/3230",  "3231","3232","3231/3232")) );

-- ---------------------------------------------------------------------
-- Verification, after copying to E:\Websites\lmms\migrate\
--   wc -l < apt_block.txt                             -> 5162
--   awk -F'|' '$1=="CP-PBR"'  apt_block.txt | wc -l   ->  478
--   awk -F'|' '$1=="L-10024"' apt_block.txt | wc -l   ->  511
--   awk -F'|' '$1=="L-10025"' apt_block.txt | wc -l   ->  362
--   awk -F'|' '$1=="L-10026"' apt_block.txt | wc -l   ->  224
--   awk -F'|' '$1=="V-LDBR"'  apt_block.txt | wc -l   -> 2139
--
-- The loader inserts 5,158 of the 5,162: V-AVR2 unit 1A carries the same
-- 01-03-2002..31-03-2002 range five times in the source, and the unique
-- key (resortCode, unitNo, startDate, endDate) keeps one. V-AVR2 is
-- Inactive, so with the status filter in place those five rows drop out
-- entirely and the loader inserts all 5,162.
-- ---------------------------------------------------------------------
