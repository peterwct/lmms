-- AlterTable
ALTER TABLE "Agreement" ADD COLUMN     "suCode" TEXT;

-- CreateTable
CREATE TABLE "SuReason" (
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuReason_pkey" PRIMARY KEY ("code")
);

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_suCode_fkey" FOREIGN KEY ("suCode") REFERENCES "SuReason"("code") ON DELETE SET NULL ON UPDATE CASCADE;
