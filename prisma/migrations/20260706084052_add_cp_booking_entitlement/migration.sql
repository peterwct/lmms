-- CreateTable
CREATE TABLE "CpBookingEntitlement" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT,
    "coCode" TEXT NOT NULL,
    "membershipNo" TEXT NOT NULL,
    "agreementNo" TEXT NOT NULL,
    "useYear" TIMESTAMP(3) NOT NULL,
    "totalPts" INTEGER NOT NULL DEFAULT 0,
    "curUsePts" INTEGER NOT NULL DEFAULT 0,
    "advUsePts" INTEGER NOT NULL DEFAULT 0,
    "acrusePts" INTEGER NOT NULL DEFAULT 0,
    "balPts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CpBookingEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CpBookingEntitlement_coCode_membershipNo_agreementNo_idx" ON "CpBookingEntitlement"("coCode", "membershipNo", "agreementNo");

-- CreateIndex
CREATE UNIQUE INDEX "CpBookingEntitlement_coCode_membershipNo_agreementNo_useYea_key" ON "CpBookingEntitlement"("coCode", "membershipNo", "agreementNo", "useYear");
