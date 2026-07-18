-- Produção dirigida: cada insumo preparado aponta para sua matéria-prima
-- (Desfiado/Lascas/Casquinha → "Bacalhau (kg)"). A produção manual só é
-- permitida para insumos com origem definida — hoje, apenas o bacalhau.

ALTER TABLE "StockItem" ADD COLUMN "sourceId" TEXT;
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "StockItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
