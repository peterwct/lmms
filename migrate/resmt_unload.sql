-- =====================================================================
-- resmt UNLOAD  ->  migrate/resmt.txt   (Prisma model: ResortMaintenance)
-- =====================================================================
-- Run with:  dbaccess <database> resmt_unload.sql
--
-- Full-row export (SELECT *, 9 columns + trailing empty field);
-- prisma/migrate-maintenance.ts reads only [0..5] positionally:
--   [0] rm_serial_no   -> ResortMaintenance.serialNo
--   [1] rm_resort_code -> ResortMaintenance.resortCode
--   [2] rm_apt_code    -> ResortMaintenance.unitNo    (incl. "3231/3232", "3.9B")
--   [3] rm_checkin     -> ResortMaintenance.startDate (dd-mm-yyyy)
--   [4] rm_checkout    -> ResortMaintenance.endDate   (dd-mm-yyyy)
--   [5] rm_remarks     -> ResortMaintenance.remarks   (the reason)
--   [6..8] rm_user_name / rm_sys_date / rm_lock_status  NOT migrated
--
-- This export is UNFILTERED by resort, matching what is in use today.
-- Rows for retired resort codes (L-10020, L-10027, L-10013, L-103, ...)
-- have no Resort row to satisfy the FK and are skipped by the importer
-- with a summary WARN - that is expected, not an error. To export the
-- active resorts only, add:
--   AND rm_resort_code IN ("CP-PBR","L-10016","L-10024","L-10025",
--                          "L-10026","L-101","L-103A")
-- (the importer handles either form).
--
-- =====================================================================
-- LIVE UNIT REGISTER FILTER - added 2026-08-11
-- =====================================================================
-- ResortMaintenance references its unit by string, with no FK to
-- ResortUnit, so the retired unit numbers dropped from
-- apt_mast_unload.sql must be dropped here too - otherwise a re-import
-- loads maintenance records for units that no longer exist.
--
--   L-10024  GREENHILL RESORT         A1..A34
--   L-10025  GOLDEN CITY CONDOMINIUM  B1..B22
--   L-10026  LEISURE COVE             floors 4 and 5
--   CP-PBR   PERDANA SERVICE APT      the 32xx family, all 3 lock rows
--
-- Every other resort exports in full (L-10016 KEMANG INDAH and L-101
-- SANTANA are already exactly the live register and are NOT filtered).
--
-- *** THIS WHITELIST MUST MATCH apt_mast_unload.sql AND
-- apt_block_unload.sql EXACTLY. *** Drops 2,492 rows, every one of them
-- historic - no affected record ends on or after today, so the
-- ResAvailMast grid needs no correction.
-- =====================================================================

UNLOAD TO 'resmt.txt' DELIMITER '|'
SELECT *
  FROM resmt
 WHERE rm_resort_code NOT IN ("L-10024","L-10025","L-10026","CP-PBR")

    -- GREENHILL RESORT: A1..A34
    OR (rm_resort_code = "L-10024" AND TRIM(rm_apt_code) IN (
        "A1" ,"A2" ,"A3" ,"A4" ,"A5" ,"A6" ,"A7" ,"A8" ,"A9" ,"A10",
        "A11","A12","A13","A14","A15","A16","A17","A18","A19","A20",
        "A21","A22","A23","A24","A25","A26","A27","A28","A29","A30",
        "A31","A32","A33","A34"))

    -- GOLDEN CITY CONDOMINIUM: B1..B22
    OR (rm_resort_code = "L-10025" AND TRIM(rm_apt_code) IN (
        "B1" ,"B2" ,"B3" ,"B4" ,"B5" ,"B6" ,"B7" ,"B8" ,"B9" ,"B10",
        "B11","B12","B13","B14","B15","B16","B17","B18","B19","B20",
        "B21","B22"))

    -- LEISURE COVE: floors 4 and 5 only
    OR (rm_resort_code = "L-10026" AND TRIM(rm_apt_code) IN (
        "401","402","404","406","407","408","410",
        "501","502","504","506","507","508","510"))

    -- PERDANA SERVICE APARTMENT & RESORT: 16 apartments x 3 lock-on/off rows
    OR (rm_resort_code = "CP-PBR" AND TRIM(rm_apt_code) IN (
        "3201","3202","3201/3202",  "3203","3204","3203/3204",
        "3205","3206","3205/3206",  "3207","3208","3207/3208",
        "3209","3210","3209/3210",  "3211","3212","3211/3212",
        "3213","3214","3213/3214",  "3215","3216","3215/3216",
        "3217","3218","3217/3218",  "3219","3220","3219/3220",
        "3221","3222","3221/3222",  "3223","3224","3223/3224",
        "3225","3226","3225/3226",  "3227","3228","3227/3228",
        "3229","3230","3229/3230",  "3231","3232","3231/3232"));

-- ---------------------------------------------------------------------
-- Verification, after copying to E:\Websites\lmms\migrate\
--   wc -l < resmt.txt                             -> 10904  (was 13396)
--   awk -F'|' '$2=="CP-PBR"'  resmt.txt | wc -l   ->   166  (was   600)
--   awk -F'|' '$2=="L-10024"' resmt.txt | wc -l   ->  1593  (was  1918)
--   awk -F'|' '$2=="L-10025"' resmt.txt | wc -l   ->  1216  (was  1602)
--   awk -F'|' '$2=="L-10026"' resmt.txt | wc -l   ->   507  (was  1854)
-- ---------------------------------------------------------------------
