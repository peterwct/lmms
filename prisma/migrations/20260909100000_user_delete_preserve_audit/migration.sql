-- Allow a User to be deleted while the audit trail survives.
--
-- AuditLog.userId becomes nullable with ON DELETE SET NULL, and each row carries a
-- snapshot of who performed the action (actorUsername / actorName) so the Audit Log
-- page still names the actor after the account is gone. Existing rows are backfilled
-- from User before the FK is relaxed.
--
-- UserReportAccess: a deleted user's own grants go with them (CASCADE); grants they
-- ISSUED to other users must not, so grantedById becomes nullable with SET NULL.

-- 1. Actor snapshot on AuditLog
ALTER TABLE "AuditLog" ADD COLUMN "actorUsername" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "actorName"     TEXT;

UPDATE "AuditLog" a
   SET "actorUsername" = u."username",
       "actorName"     = u."fullName"
  FROM "User" u
 WHERE u."id" = a."userId";

-- 2. AuditLog.userId nullable, ON DELETE SET NULL
ALTER TABLE "AuditLog" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_userId_fkey";
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. UserReportAccess.userId ON DELETE CASCADE
ALTER TABLE "UserReportAccess" DROP CONSTRAINT "UserReportAccess_userId_fkey";
ALTER TABLE "UserReportAccess" ADD CONSTRAINT "UserReportAccess_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. UserReportAccess.grantedById nullable, ON DELETE SET NULL
ALTER TABLE "UserReportAccess" ALTER COLUMN "grantedById" DROP NOT NULL;
ALTER TABLE "UserReportAccess" DROP CONSTRAINT "UserReportAccess_grantedById_fkey";
ALTER TABLE "UserReportAccess" ADD CONSTRAINT "UserReportAccess_grantedById_fkey"
  FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
