-- CreateTable
CREATE TABLE "ResortUnit" (
    "id" TEXT NOT NULL,
    "resortId" TEXT NOT NULL,
    "resortCode" TEXT NOT NULL,
    "unitNo" TEXT NOT NULL,
    "apartmentType" TEXT NOT NULL,
    "occupancy" INTEGER,
    "rciReserved" TEXT NOT NULL DEFAULT 'N',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResortUnit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResortUnit_resortCode_unitNo_key" ON "ResortUnit"("resortCode", "unitNo");

-- AddForeignKey
ALTER TABLE "ResortUnit" ADD CONSTRAINT "ResortUnit_resortId_fkey" FOREIGN KEY ("resortId") REFERENCES "Resort"("id") ON DELETE CASCADE ON UPDATE CASCADE;
