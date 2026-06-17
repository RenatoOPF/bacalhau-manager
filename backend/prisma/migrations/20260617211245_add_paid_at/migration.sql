-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paidAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Order_paidAt_idx" ON "Order"("paidAt");
