-- CreateTable
CREATE TABLE "CpSeasonDate" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "season" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CpSeasonDate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CpSeasonDate_date_key" ON "CpSeasonDate"("date");

-- CreateIndex
CREATE INDEX "CpSeasonDate_year_idx" ON "CpSeasonDate"("year");
