-- AlterTable: pre-billing schedule snapshot on each invoice, for exact cancel rollback
ALTER TABLE "AmcInvoice" ADD COLUMN "prevNextDueDate" TIMESTAMP(3);
ALTER TABLE "AmcInvoice" ADD COLUMN "prevLastInvoiceDate" TIMESTAMP(3);
