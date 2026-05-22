-- AlterTable
ALTER TABLE "Agreement" ADD COLUMN     "govtTax" DECIMAL(12,2),
ADD COLUMN     "legacyModifiedAt" TIMESTAMP(3),
ADD COLUMN     "sinkFund" DECIMAL(12,2);
