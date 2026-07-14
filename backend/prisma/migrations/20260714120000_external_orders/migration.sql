-- Novos valores de enum para pedidos externos (iFood/99, pagos online).
ALTER TYPE "OrderChannel" ADD VALUE IF NOT EXISTS 'NOVENTA_NOVE';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'ONLINE';

-- Referência externa + dedup por canal.
ALTER TABLE "Order" ADD COLUMN "externalId" TEXT;
CREATE UNIQUE INDEX "Order_channel_externalId_key" ON "Order"("channel", "externalId");
