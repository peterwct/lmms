/*
  Warnings:

  - You are about to drop the column `accessLevel` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "accessLevel";

-- DropEnum
DROP TYPE "AccessLevel";
