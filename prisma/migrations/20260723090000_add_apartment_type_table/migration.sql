-- CreateTable
CREATE TABLE "ApartmentType" (
    "id" TEXT NOT NULL,
    "resortId" TEXT NOT NULL,
    "resortCode" TEXT NOT NULL,
    "apartmentType" TEXT NOT NULL,
    "description" TEXT,
    "lockType" TEXT NOT NULL DEFAULT 'LN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApartmentType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApartmentType_resortCode_apartmentType_key" ON "ApartmentType"("resortCode", "apartmentType");

-- AddForeignKey
ALTER TABLE "ApartmentType" ADD CONSTRAINT "ApartmentType_resortId_fkey" FOREIGN KEY ("resortId") REFERENCES "Resort"("id") ON DELETE CASCADE ON UPDATE CASCADE;
