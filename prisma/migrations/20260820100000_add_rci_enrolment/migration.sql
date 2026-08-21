-- CreateTable
CREATE TABLE "RciEnrolment" (
    "id" TEXT NOT NULL,
    "serialNo" INTEGER NOT NULL,
    "coCode" TEXT NOT NULL,
    "membershipNo" TEXT NOT NULL,
    "agreementNo" TEXT NOT NULL,
    "rciNo" TEXT,
    "renewalDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "rciFees" DECIMAL(8,2),
    "resortCode" TEXT,
    "firstName1" TEXT,
    "lastName1" TEXT,
    "name1" TEXT,
    "firstName2" TEXT,
    "lastName2" TEXT,
    "mailAdd1" TEXT,
    "mailAdd2" TEXT,
    "mailAdd3" TEXT,
    "mailCityState" TEXT,
    "mailPostcode" TEXT,
    "malaysia" TEXT,
    "telNo1" TEXT,
    "telNo2" TEXT,
    "coOwner" TEXT,
    "rciStatus" TEXT,
    "totInterval" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RciEnrolment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RciEnrolment_serialNo_key" ON "RciEnrolment"("serialNo");

-- CreateIndex
CREATE INDEX "RciEnrolment_coCode_membershipNo_agreementNo_idx" ON "RciEnrolment"("coCode", "membershipNo", "agreementNo");

-- CreateIndex
CREATE INDEX "RciEnrolment_rciNo_idx" ON "RciEnrolment"("rciNo");

-- CreateIndex
CREATE INDEX "RciEnrolment_membershipNo_idx" ON "RciEnrolment"("membershipNo");
