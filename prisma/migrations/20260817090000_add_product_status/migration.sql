-- Product gains an Active/Inactive status, matching LvcCode and Resort (A/U).
-- Products can rarely be deleted (deleteProduct refuses 409 while any Agreement /
-- AmcSchedule / Resort / LvcCode still carries the coCode), so retiring a company
-- that is no longer an active exchange partner needs a status instead.
--
-- Every existing row backfills to 'A' via the DEFAULT; staff deactivate manually.
-- ps_company.psc_lockstatus stays unmigrated, so migrate-products.ts needs no change
-- (it never sets this column) -- but note a re-import truncates and reimports, which
-- resets every deactivation back to 'A', the same caveat LvcCode.status carries.

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'A';
