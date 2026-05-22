-- CreateEnum
CREATE TYPE "MemberType" AS ENUM ('INDIVIDUAL', 'CORPORATE');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED', 'DECEASED', 'TRANSFERRED');

-- CreateEnum
CREATE TYPE "AgreementStatus" AS ENUM ('NA', 'SU', 'PT', 'TM');

-- CreateEnum
CREATE TYPE "EntitlementType" AS ENUM ('W', 'P');

-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('N', 'C');

-- CreateEnum
CREATE TYPE "InvComponent" AS ENUM ('MAIN_AMC', 'SINKING_FUND', 'SERVICE_TAX', 'ROUNDING');

-- CreateEnum
CREATE TYPE "BillType" AS ENUM ('N', 'A', 'H', 'F');

-- CreateEnum
CREATE TYPE "AccessLevel" AS ENUM ('FULL_ACCESS', 'READ_WRITE', 'READ_ONLY');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AppModule" AS ENUM ('ADMIN', 'MEMBERS', 'AGREEMENTS', 'AMC_BILLING', 'RESORT_BOOKING', 'ENTITLEMENTS');

-- CreateEnum
CREATE TYPE "AuditActionType" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'SUSPEND');

-- CreateTable
CREATE TABLE "Department" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "fullName" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "mustChangePwd" BOOLEAN NOT NULL DEFAULT true,
    "accessLevel" "AccessLevel" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "departmentId" INTEGER NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeptModulePermission" (
    "id" SERIAL NOT NULL,
    "departmentId" INTEGER NOT NULL,
    "module" "AppModule" NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT false,
    "canCreate" BOOLEAN NOT NULL DEFAULT false,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DeptModulePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "actionType" "AuditActionType" NOT NULL,
    "targetType" TEXT,
    "targetId" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "membershipNo" TEXT NOT NULL,
    "memberType" "MemberType" NOT NULL,
    "branchCode" TEXT,
    "accpacRef" TEXT,
    "subsCategory" TEXT,
    "fullName" TEXT NOT NULL,
    "salutation" TEXT,
    "nameCard" TEXT,
    "icOld" TEXT,
    "icNew" TEXT,
    "nationality" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "gender" TEXT,
    "race" TEXT,
    "maritalStatus" TEXT,
    "email" TEXT,
    "telHome" TEXT,
    "telMobile" TEXT,
    "resAdd1" TEXT,
    "resAdd2" TEXT,
    "resAdd3" TEXT,
    "resCityState" TEXT,
    "resPostcode" TEXT,
    "resStateCode" TEXT,
    "mailAdd1" TEXT,
    "mailAdd2" TEXT,
    "mailAdd3" TEXT,
    "mailCityState" TEXT,
    "mailPostcode" TEXT,
    "mailStateCode" TEXT,
    "workNature" TEXT,
    "companyName" TEXT,
    "compAdd1" TEXT,
    "compAdd2" TEXT,
    "compAdd3" TEXT,
    "compCityState" TEXT,
    "compPostcode" TEXT,
    "compStateCode" TEXT,
    "telOffice" TEXT,
    "designation" TEXT,
    "spouseName" TEXT,
    "spouseIc" TEXT,
    "jaName" TEXT,
    "jaIc" TEXT,
    "jaIcNew" TEXT,
    "jaSalutation" TEXT,
    "jaDesignation" TEXT,
    "jaNameCard" TEXT,
    "jaAdd1" TEXT,
    "jaAdd2" TEXT,
    "jaAdd3" TEXT,
    "jaCity" TEXT,
    "jaPostcode" TEXT,
    "jaState" TEXT,
    "jaTelHome" TEXT,
    "jaTelOffice" TEXT,
    "jaMobile" TEXT,
    "jaEmail" TEXT,
    "registrationNo" TEXT,
    "incorporationDate" TIMESTAMP(3),
    "businessNature" TEXT,
    "tinNumber" VARCHAR(15),
    "enrolRci" BOOLEAN NOT NULL DEFAULT false,
    "activeHcm" BOOLEAN NOT NULL DEFAULT false,
    "remarks" TEXT,
    "status" "MemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "legacyCreatedAt" TIMESTAMP(3),
    "legacyModifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agreement" (
    "id" TEXT NOT NULL,
    "agreementNo" TEXT NOT NULL,
    "legacyAgreementNo" TEXT,
    "memberId" TEXT NOT NULL,
    "membershipNo" TEXT NOT NULL,
    "agreementDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "termYears" INTEGER NOT NULL,
    "coCode" TEXT NOT NULL,
    "entitlementType" "EntitlementType" NOT NULL,
    "agreementType" TEXT,
    "memberType" TEXT,
    "totalPoints" INTEGER,
    "acctClassify" "AgreementStatus" NOT NULL DEFAULT 'NA',
    "acctStatus" TEXT,
    "purchasePrice" DECIMAL(12,2),
    "downPayment" DECIMAL(12,2),
    "subFees" DECIMAL(12,2),
    "loanAmount" DECIMAL(12,2),
    "loanType" TEXT,
    "salesBranch" TEXT,
    "salesMonth" TEXT,
    "salesSource" TEXT,
    "certificateNo" TEXT,
    "transferFlag" TEXT,
    "transferToMembership" TEXT,
    "transferFromMembership" TEXT,
    "canCode" TEXT,
    "rciRefNo" TEXT,
    "rciEnrolDate" TIMESTAMP(3),
    "rciExpiryDate" TIMESTAMP(3),
    "rciFeePaid" DECIMAL(12,2),
    "outstdDoc" BOOLEAN NOT NULL DEFAULT false,
    "docDescription" TEXT,
    "legacyCreatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Nominee" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "nomineeSeq" INTEGER NOT NULL,
    "fullName" TEXT,
    "icOld" TEXT,
    "icNew" TEXT,
    "salutation" TEXT,
    "designation" TEXT,
    "nameCard" TEXT,
    "telHome" TEXT,
    "telMobile" TEXT,
    "add1" TEXT,
    "add2" TEXT,
    "add3" TEXT,
    "cityState" TEXT,
    "postcode" TEXT,
    "email" TEXT,

    CONSTRAINT "Nominee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CancellationReason" (
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "type" TEXT,
    "status" TEXT NOT NULL DEFAULT 'A',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CancellationReason_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "AmcSchedule" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "membershipNo" TEXT NOT NULL,
    "agreementNo" TEXT NOT NULL,
    "coCode" TEXT NOT NULL,
    "firstDueDate" TIMESTAMP(3),
    "nextDueDate" TIMESTAMP(3),
    "lastInvoiceDate" TIMESTAMP(3),
    "invoicesIssued" INTEGER NOT NULL DEFAULT 0,
    "totalInvoices" INTEGER NOT NULL,
    "priceCode" TEXT,
    "billingStatus" "BillingStatus" NOT NULL DEFAULT 'N',
    "legacyCreatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmcSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmcInvoice" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "membershipNo" TEXT NOT NULL,
    "agreementNo" TEXT NOT NULL,
    "docNo" TEXT,
    "invNo" TEXT NOT NULL,
    "invComponent" "InvComponent" NOT NULL,
    "invDate" TIMESTAMP(3) NOT NULL,
    "amcDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "invoiceYearSeq" INTEGER,
    "invAmount" DECIMAL(12,2) NOT NULL,
    "totalPoints" INTEGER,
    "rate" DECIMAL(8,4),
    "amountInWords" TEXT,
    "billType" "BillType" NOT NULL,
    "coCode" TEXT NOT NULL,
    "isProcessed" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "printDate" TIMESTAMP(3),
    "printUser" TEXT,
    "printCount" INTEGER NOT NULL DEFAULT 0,
    "newFlag" TEXT,
    "legacyCreatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmcInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmcPrice" (
    "id" TEXT NOT NULL,
    "coCode" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "priceCode" TEXT NOT NULL,
    "currencyCode" TEXT,
    "amcAmount" DECIMAL(12,2) NOT NULL,
    "sinkingFund" DECIMAL(12,2) NOT NULL,
    "serviceTax" DECIMAL(12,2) NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "amountInWords" TEXT,
    "rate" DECIMAL(8,4) NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmcPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmcPricePoints" (
    "id" TEXT NOT NULL,
    "coCode" TEXT NOT NULL DEFAULT '02',
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "minPoints" INTEGER NOT NULL,
    "maxPoints" INTEGER NOT NULL,
    "amcRatePerPoint" DECIMAL(8,4) NOT NULL,
    "sinkingFundPct" DECIMAL(6,2) NOT NULL,
    "gstPct" DECIMAL(6,2) NOT NULL,
    "unitPrice" DECIMAL(12,2),
    "rciPoints" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmcPricePoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "DeptModulePermission_departmentId_module_key" ON "DeptModulePermission"("departmentId", "module");

-- CreateIndex
CREATE UNIQUE INDEX "Member_membershipNo_key" ON "Member"("membershipNo");

-- CreateIndex
CREATE UNIQUE INDEX "Nominee_agreementId_nomineeSeq_key" ON "Nominee"("agreementId", "nomineeSeq");

-- CreateIndex
CREATE UNIQUE INDEX "AmcSchedule_agreementId_key" ON "AmcSchedule"("agreementId");

-- CreateIndex
CREATE UNIQUE INDEX "AmcPrice_coCode_priceCode_effectiveDate_key" ON "AmcPrice"("coCode", "priceCode", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "AmcPricePoints_coCode_minPoints_maxPoints_effectiveDate_key" ON "AmcPricePoints"("coCode", "minPoints", "maxPoints", "effectiveDate");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeptModulePermission" ADD CONSTRAINT "DeptModulePermission_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nominee" ADD CONSTRAINT "Nominee_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmcSchedule" ADD CONSTRAINT "AmcSchedule_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmcInvoice" ADD CONSTRAINT "AmcInvoice_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "AmcSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmcInvoice" ADD CONSTRAINT "AmcInvoice_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
