-- CreateTable
CREATE TABLE "RciBulkBank" (
    "id" TEXT NOT NULL,
    "serialNo" INTEGER NOT NULL,
    "resortId" TEXT NOT NULL,
    "resortCode" TEXT NOT NULL,
    "unitNo" TEXT NOT NULL,
    "apartmentType" TEXT,
    "checkIn" TIMESTAMP(3) NOT NULL,
    "checkOut" TIMESTAMP(3) NOT NULL,
    "weekYear" INTEGER,
    "weekNo" INTEGER,
    "season" TEXT NOT NULL,
    "bankStatus" TEXT NOT NULL DEFAULT 'B',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RciBulkBank_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RciBulkBank_serialNo_key" ON "RciBulkBank"("serialNo");

-- CreateIndex
CREATE INDEX "RciBulkBank_weekYear_weekNo_idx" ON "RciBulkBank"("weekYear", "weekNo");

-- CreateIndex
CREATE INDEX "RciBulkBank_resortCode_unitNo_idx" ON "RciBulkBank"("resortCode", "unitNo");

-- CreateIndex
CREATE UNIQUE INDEX "RciBulkBank_resortCode_unitNo_checkIn_checkOut_key" ON "RciBulkBank"("resortCode", "unitNo", "checkIn", "checkOut");

-- AddForeignKey
ALTER TABLE "RciBulkBank" ADD CONSTRAINT "RciBulkBank_resortId_fkey" FOREIGN KEY ("resortId") REFERENCES "Resort"("id") ON DELETE CASCADE ON UPDATE CASCADE;
