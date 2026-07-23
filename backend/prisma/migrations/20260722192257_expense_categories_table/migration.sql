-- Converte a categoria de despesa de ENUM para TABELA editável, preservando os
-- dados existentes (as despesas mantêm sua categoria via backfill).

-- 1. Guarda o valor atual do enum em texto temporário.
ALTER TABLE "Expense" ADD COLUMN "categoryLegacy" TEXT;
UPDATE "Expense" SET "categoryLegacy" = "category"::text;

-- 2. Remove a coluna enum e o tipo (libera o nome para a tabela).
DROP INDEX "Expense_category_idx";
ALTER TABLE "Expense" DROP COLUMN "category";
DROP TYPE "ExpenseCategory";

-- 3. Cria a tabela de categorias.
CREATE TABLE "ExpenseCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ExpenseCategory_name_key" ON "ExpenseCategory"("name");

-- 4. Semeia as 7 categorias que existiam no enum (ids fixos p/ o backfill).
INSERT INTO "ExpenseCategory" ("id", "name", "sortOrder", "updatedAt") VALUES
  ('cat_rent',      'Aluguel',          0, now()),
  ('cat_payroll',   'Funcionários',     1, now()),
  ('cat_packaging', 'Embalagem',        2, now()),
  ('cat_delivery',  'Entrega/Motoboy',  3, now()),
  ('cat_supplies',  'Fornecedores',     4, now()),
  ('cat_taxes',     'Impostos',         5, now()),
  ('cat_other',     'Outros',           6, now());

-- 5. Liga a despesa à tabela.
ALTER TABLE "Expense" ADD COLUMN "categoryId" TEXT;
CREATE INDEX "Expense_categoryId_idx" ON "Expense"("categoryId");
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 6. Backfill: mapeia o enum antigo para a categoria semeada.
UPDATE "Expense" SET "categoryId" = CASE "categoryLegacy"
  WHEN 'RENT'      THEN 'cat_rent'
  WHEN 'PAYROLL'   THEN 'cat_payroll'
  WHEN 'PACKAGING' THEN 'cat_packaging'
  WHEN 'DELIVERY'  THEN 'cat_delivery'
  WHEN 'SUPPLIES'  THEN 'cat_supplies'
  WHEN 'TAXES'     THEN 'cat_taxes'
  ELSE 'cat_other'
END;

-- 7. Remove o texto temporário.
ALTER TABLE "Expense" DROP COLUMN "categoryLegacy";
