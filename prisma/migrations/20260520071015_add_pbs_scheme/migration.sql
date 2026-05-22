-- CreateTable
CREATE TABLE "PbsScheme" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "coCode" TEXT NOT NULL,
    "agreementNo" TEXT NOT NULL,
    "certNo" TEXT,
    "schemeType" TEXT,
    "paybackDate" TIMESTAMP(3),
    "topUp" BOOLEAN NOT NULL DEFAULT false,
    "pbsIndc" BOOLEAN NOT NULL DEFAULT false,
    "claimIndc" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PbsScheme_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PbsScheme_agreementId_key" ON "PbsScheme"("agreementId");

-- AddForeignKey
ALTER TABLE "PbsScheme" ADD CONSTRAINT "PbsScheme_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
