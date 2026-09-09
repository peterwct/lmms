-- AlterEnum
-- Gates the Resorts Setup module (fns 1-10) per user, ANDed on top of the RESORTS_SETUP
-- department matrix. The grant itself is DATA, not schema -- it is issued through
-- Admin > Users > Report & Function Access AFTER this migration is deployed. Do not add
-- an INSERT here: Postgres refuses to use an enum value added in the same transaction.
ALTER TYPE "ReportKey" ADD VALUE 'RESORTS_SETUP_ACCESS';
