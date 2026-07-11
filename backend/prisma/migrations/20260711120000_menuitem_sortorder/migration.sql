-- Ordem de exibição dos itens dentro da categoria.
ALTER TABLE "MenuItem" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
