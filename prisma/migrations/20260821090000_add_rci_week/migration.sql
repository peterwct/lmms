-- CreateTable
CREATE TABLE "RciWeek" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "weekNo" INTEGER NOT NULL,
    "friStart" TIMESTAMP(3) NOT NULL,
    "friEnd" TIMESTAMP(3) NOT NULL,
    "satStart" TIMESTAMP(3) NOT NULL,
    "satEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RciWeek_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RciWeek_year_weekNo_key" ON "RciWeek"("year", "weekNo");
