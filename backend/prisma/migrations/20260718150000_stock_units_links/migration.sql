-- Estoque v2: unidades por insumo (porção/kg/un), saldo em milésimos e
-- vínculos N:N com quantidade (StockLink) — um prato pode consumir vários
-- insumos (ex.: Moqueca de Polvo com Camarão). Migra os vínculos v1
-- (MenuItem.stockItemId / MenuItemOption.stockItemId) para a nova tabela.

-- Unidade do insumo
ALTER TABLE "StockItem" ADD COLUMN "unit" TEXT NOT NULL DEFAULT 'porção';

-- Saldo: de meias porções (x2) para milésimos (x1000) → multiplica por 500
ALTER TABLE "StockItem" RENAME COLUMN "halfUnits" TO "qtyMilli";
ALTER TABLE "StockItem" RENAME COLUMN "alertHalfUnits" TO "alertMilli";
UPDATE "StockItem" SET "qtyMilli" = "qtyMilli" * 500, "alertMilli" = "alertMilli" * 500;
ALTER TABLE "StockItem" ALTER COLUMN "alertMilli" SET DEFAULT 2000;

ALTER TABLE "StockMovement" RENAME COLUMN "deltaHalfUnits" TO "deltaMilli";
UPDATE "StockMovement" SET "deltaMilli" = "deltaMilli" * 500;

-- CreateTable
CREATE TABLE "StockLink" (
    "id" TEXT NOT NULL,
    "stockItemId" TEXT NOT NULL,
    "menuItemId" TEXT,
    "optionId" TEXT,
    "qtyMilli" INTEGER NOT NULL DEFAULT 1000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StockLink_stockItemId_menuItemId_key" ON "StockLink"("stockItemId", "menuItemId");
CREATE UNIQUE INDEX "StockLink_stockItemId_optionId_key" ON "StockLink"("stockItemId", "optionId");
CREATE INDEX "StockLink_menuItemId_idx" ON "StockLink"("menuItemId");
CREATE INDEX "StockLink_optionId_idx" ON "StockLink"("optionId");

ALTER TABLE "StockLink" ADD CONSTRAINT "StockLink_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockLink" ADD CONSTRAINT "StockLink_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockLink" ADD CONSTRAINT "StockLink_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "MenuItemOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migra vínculos v1 dos pratos (consumo por Inteira = stockHalfUnits × 500)
INSERT INTO "StockLink" ("id", "stockItemId", "menuItemId", "qtyMilli")
SELECT gen_random_uuid()::text, "stockItemId", "id", "stockHalfUnits" * 500
FROM "MenuItem" WHERE "stockItemId" IS NOT NULL;

-- Migra vínculos v1 das opções (Meia/Individual = 500, senão 1000)
INSERT INTO "StockLink" ("id", "stockItemId", "optionId", "qtyMilli")
SELECT gen_random_uuid()::text, "stockItemId", "id",
  CASE WHEN lower("name") LIKE '%meia%' OR lower("name") LIKE '%individual%'
       THEN 500 ELSE 1000 END
FROM "MenuItemOption" WHERE "stockItemId" IS NOT NULL;

-- Remove as colunas v1
ALTER TABLE "MenuItem" DROP CONSTRAINT "MenuItem_stockItemId_fkey";
ALTER TABLE "MenuItem" DROP COLUMN "stockItemId";
ALTER TABLE "MenuItem" DROP COLUMN "stockHalfUnits";
ALTER TABLE "MenuItemOption" DROP CONSTRAINT "MenuItemOption_stockItemId_fkey";
ALTER TABLE "MenuItemOption" DROP COLUMN "stockItemId";
