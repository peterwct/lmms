-- CreateTable
CREATE TABLE "BookingEntitlement" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "coCode" TEXT NOT NULL,
    "agreementNo" TEXT NOT NULL,
    "membershipNo" TEXT NOT NULL,
    "yearSeq" INTEGER NOT NULL,
    "nightsUsed" INTEGER NOT NULL DEFAULT 0,
    "weekendUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingEntitlement_coCode_agreementNo_membershipNo_idx" ON "BookingEntitlement"("coCode", "agreementNo", "membershipNo");

-- CreateIndex
CREATE UNIQUE INDEX "BookingEntitlement_coCode_agreementNo_membershipNo_yearSeq_key" ON "BookingEntitlement"("coCode", "agreementNo", "membershipNo", "yearSeq");

-- AddForeignKey
ALTER TABLE "BookingEntitlement" ADD CONSTRAINT "BookingEntitlement_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
