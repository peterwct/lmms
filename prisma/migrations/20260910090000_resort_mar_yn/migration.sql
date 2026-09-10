-- Resort.mar is reshaped from 3-char free text into a Y/N flag, and its Informix sourcing
-- is dropped (business decision 2026-09-10, one day after the column was added).
--
-- It was migrated from resort_mast.re_exc_reg, which is char(3) and genuinely uses the
-- width: Y 253 / N 36 / blank 18 / APR 16 / '10' 1. None of that is the intended starting
-- state -- APR sits on 16 retired coCode 03 resorts, '10' on the '%' ALL RESORTS
-- pseudo-row, and the 253 Y's are mostly retired resorts. MAR is a simple Y/N flag that
-- staff own, so the column is DROPPED (discarding the seeded values) and re-created.
--
-- NOT NULL is safe now where it was not before: the control is a checkbox, which always
-- submits 'Y' or 'N', so the '' -> null mapping in clean() (resorts.controller.ts) and in
-- the form's payload builder can never produce a null. z.enum(['Y','N']) in the controller
-- is the 1-char constraint -- there are no @db.VarChar widths anywhere in this schema.
--
-- The six MAR resorts are business-supplied and NOT derivable from re_exc_reg: V-AWT3 is
-- an active partner resort and is excluded, while L-10016 carries 'Y' in the source and is
-- not wanted. They are also seeded by MAR_YES in prisma/migrate-resorts.ts, which stamps
-- them on INSERT so a truncating refresh reproduces this baseline.
--
-- A NEW migration rather than an edit to 20260909140000_add_resort_mar: that one is
-- already applied, and editing an applied migration breaks Prisma's checksums.

-- AlterTable
ALTER TABLE "Resort" DROP COLUMN "mar";
ALTER TABLE "Resort" ADD COLUMN     "mar" TEXT NOT NULL DEFAULT 'N';

-- The six MAR resorts (business-supplied 2026-09-10). Everything else stays 'N'.
UPDATE "Resort" SET "mar" = 'Y'
 WHERE "resortCode" IN ('V-CLC1','V-CLC2','V-LDBR','V-SGH','V-SGI1','V-SGI5');
