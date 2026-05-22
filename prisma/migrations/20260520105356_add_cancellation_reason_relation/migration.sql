-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_canCode_fkey" FOREIGN KEY ("canCode") REFERENCES "CancellationReason"("code") ON DELETE SET NULL ON UPDATE CASCADE;
