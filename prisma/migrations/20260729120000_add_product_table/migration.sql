-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "coCode" TEXT NOT NULL,
    "coName" TEXT NOT NULL,
    "entType" TEXT NOT NULL,
    "add1" TEXT,
    "add2" TEXT,
    "add3" TEXT,
    "telNo" TEXT,
    "faxNo" TEXT,
    "contactPerson" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_coCode_key" ON "Product"("coCode");
