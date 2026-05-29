-- CreateEnum
CREATE TYPE "ReportKey" AS ENUM ('MEMBER_REPORT', 'AGREEMENT_REPORT');

-- CreateTable
CREATE TABLE "UserReportAccess" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "reportKey" "ReportKey" NOT NULL,
    "grantedById" INTEGER NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserReportAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserReportAccess_userId_reportKey_key" ON "UserReportAccess"("userId", "reportKey");

-- AddForeignKey
ALTER TABLE "UserReportAccess" ADD CONSTRAINT "UserReportAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserReportAccess" ADD CONSTRAINT "UserReportAccess_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
