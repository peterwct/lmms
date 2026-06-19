-- CreateTable
CREATE TABLE "PbsClaim" (
    "id" TEXT NOT NULL,
    "pbsSchemeId" TEXT NOT NULL,
    "agreementNo" TEXT NOT NULL,
    "certNo" TEXT,
    "refNo" INTEGER NOT NULL,
    "claimant" TEXT,
    "claimantIc" TEXT,
    "accNo" TEXT,
    "bankCode" TEXT,
    "relationCode" TEXT,
    "remark" TEXT,
    "lossDate" TIMESTAMP(3),
    "claimAmt" DECIMAL(12,2) NOT NULL,
    "payMode" TEXT,
    "docNo" TEXT,
    "docDate" TIMESTAMP(3),
    "claimType" TEXT,
    "claimRemark" TEXT,
    "trustPaidDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PbsClaim_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PbsClaim" ADD CONSTRAINT "PbsClaim_pbsSchemeId_fkey" FOREIGN KEY ("pbsSchemeId") REFERENCES "PbsScheme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
