-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ReportKey" ADD VALUE 'PBS_PAY_BY_MONTH_REPORT';
ALTER TYPE "ReportKey" ADD VALUE 'PBS_CLAIM_REPORT';
