-- CreateTable
CREATE TABLE "Resort" (
    "id" TEXT NOT NULL,
    "resortCode" TEXT NOT NULL,
    "coCode" TEXT NOT NULL,
    "shortName" TEXT,
    "resortName" TEXT NOT NULL,
    "rciCode" TEXT,
    "rciRelease" TEXT,
    "lockOnOff" TEXT,
    "resortMgmt" TEXT,
    "contactPerson" TEXT,
    "add1" TEXT,
    "add2" TEXT,
    "add3" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "telNo" TEXT,
    "faxNo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'A',
    "paymt" TEXT,
    "lockStatus" TEXT,
    "legacyCreateUser" TEXT,
    "legacyCreateDate" TIMESTAMP(3),
    "legacyModUser" TEXT,
    "legacyModDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Resort_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Resort_resortCode_key" ON "Resort"("resortCode");
