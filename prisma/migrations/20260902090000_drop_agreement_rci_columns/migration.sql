-- Agreement's five RCI columns were a denormalized cache of ONE arbitrarily-chosen
-- RciEnrolment row: an agreement can hold several enrolments, and the backfill
-- (prisma/migrate-rci-enrol.ts, now deleted) picked one by file order, last non-empty
-- value wins, never writing null. A second write path on Agreement Detail could edit the
-- cache without the register ever seeing it, so the two stores drifted silently.
--
-- RciEnrolment is now the single source of truth. Agreement Detail renders its current
-- row read-only; RCI fn 1 (/rci/enrolment) is the only place RCI data is edited.
--
-- 19,853 rows carried a value in at least one of these columns and are archived at
-- prisma/archive/agreement_rci_archive_20260902.csv. All but 1,879 also exist in
-- RciEnrolment; those 1,879 are every one coCode 03 / acctClassify TM, because Informix's
-- rci_enrol does not retain terminated agreements.
ALTER TABLE "Agreement"
  DROP COLUMN "rciRefNo",
  DROP COLUMN "rciNominee",
  DROP COLUMN "rciEnrolDate",
  DROP COLUMN "rciExpiryDate",
  DROP COLUMN "rciFeePaid";
