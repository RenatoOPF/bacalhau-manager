-- AlterTable
ALTER TABLE "StockItem" ADD COLUMN     "substituteFactor" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "substituteId" TEXT;

-- AddForeignKey
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_substituteId_fkey" FOREIGN KEY ("substituteId") REFERENCES "StockItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
