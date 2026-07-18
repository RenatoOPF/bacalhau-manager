-- Alerta de estoque baixo dispara com 1 porção/kg/un (antes: 2).
ALTER TABLE "StockItem" ALTER COLUMN "alertMilli" SET DEFAULT 1000;
UPDATE "StockItem" SET "alertMilli" = 1000;
