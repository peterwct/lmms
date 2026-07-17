-- CreateTable
CREATE TABLE "AmcInvoiceCounter" (
    "coCode" TEXT NOT NULL,
    "lastInvNo" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmcInvoiceCounter_pkey" PRIMARY KEY ("coCode")
);
