-- CreateTable
CREATE TABLE "ResortMaintenance" (
    "id" TEXT NOT NULL,
    "resortId" TEXT NOT NULL,
    "resortCode" TEXT NOT NULL,
    "unitNo" TEXT NOT NULL,
    "apartmentType" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "remarks" TEXT,
    "serialNo" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ResortMaintenance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResortMaintenance_resortCode_unitNo_startDate_key" ON "ResortMaintenance"("resortCode", "unitNo", "startDate");

-- AddForeignKey
ALTER TABLE "ResortMaintenance" ADD CONSTRAINT "ResortMaintenance_resortId_fkey" FOREIGN KEY ("resortId") REFERENCES "Resort"("id") ON DELETE CASCADE ON UPDATE CASCADE;
