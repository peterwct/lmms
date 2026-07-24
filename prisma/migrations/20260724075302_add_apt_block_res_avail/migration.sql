-- CreateTable
CREATE TABLE "AptBlock" (
    "id" TEXT NOT NULL,
    "resortId" TEXT NOT NULL,
    "resortCode" TEXT NOT NULL,
    "unitNo" TEXT NOT NULL,
    "apartmentType" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "blockNo" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AptBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResAvailMast" (
    "id" TEXT NOT NULL,
    "resortId" TEXT NOT NULL,
    "resortCode" TEXT NOT NULL,
    "apartmentType" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "actNight" INTEGER NOT NULL,
    "balNight" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ResAvailMast_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AptBlock_resortCode_unitNo_startDate_endDate_key" ON "AptBlock"("resortCode", "unitNo", "startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "ResAvailMast_resortCode_apartmentType_date_key" ON "ResAvailMast"("resortCode", "apartmentType", "date");

-- AddForeignKey
ALTER TABLE "AptBlock" ADD CONSTRAINT "AptBlock_resortId_fkey" FOREIGN KEY ("resortId") REFERENCES "Resort"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResAvailMast" ADD CONSTRAINT "ResAvailMast_resortId_fkey" FOREIGN KEY ("resortId") REFERENCES "Resort"("id") ON DELETE CASCADE ON UPDATE CASCADE;
