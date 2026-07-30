-- CreateTable
CREATE TABLE "LvcCode" (
    "id" TEXT NOT NULL,
    "lvcCode" TEXT NOT NULL,
    "coCode" TEXT,
    "lvcName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'A',
    "incoming" INTEGER NOT NULL DEFAULT 0,
    "outgoing" INTEGER NOT NULL DEFAULT 0,
    "faxBatch" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LvcCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LvcCode_lvcCode_key" ON "LvcCode"("lvcCode");
