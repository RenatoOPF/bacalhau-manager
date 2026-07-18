-- Estoque por porções: insumos (StockItem, saldo em meias porções),
-- movimentações (StockMovement) e vínculo dos pratos/opções ao insumo.

-- CreateTable
CREATE TABLE "StockItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "halfUnits" INTEGER NOT NULL DEFAULT 0,
    "alertHalfUnits" INTEGER NOT NULL DEFAULT 4,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "stockItemId" TEXT NOT NULL,
    "deltaHalfUnits" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockItem_name_key" ON "StockItem"("name");
CREATE INDEX "StockMovement_stockItemId_idx" ON "StockMovement"("stockItemId");
CREATE INDEX "StockMovement_orderId_idx" ON "StockMovement"("orderId");

-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN "stockItemId" TEXT;
ALTER TABLE "MenuItem" ADD COLUMN "stockHalfUnits" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "MenuItemOption" ADD COLUMN "stockItemId" TEXT;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MenuItemOption" ADD CONSTRAINT "MenuItemOption_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
