-- CreateEnum
CREATE TYPE "ResortInfoCategory" AS ENUM ('GETTING_THERE', 'RESORT_FACILITY', 'PLACE_OF_INTEREST', 'UNIT_AMENITY');

-- CreateTable
CREATE TABLE "ResortInfoLine" (
    "id" TEXT NOT NULL,
    "resortId" TEXT NOT NULL,
    "category" "ResortInfoCategory" NOT NULL,
    "seq" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResortInfoLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResortInfoLine_resortId_category_seq_key" ON "ResortInfoLine"("resortId", "category", "seq");

-- AddForeignKey
ALTER TABLE "ResortInfoLine" ADD CONSTRAINT "ResortInfoLine_resortId_fkey" FOREIGN KEY ("resortId") REFERENCES "Resort"("id") ON DELETE CASCADE ON UPDATE CASCADE;
