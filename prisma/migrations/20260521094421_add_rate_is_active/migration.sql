-- AlterTable
ALTER TABLE "AmcPrice" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "AmcPricePoints" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;
