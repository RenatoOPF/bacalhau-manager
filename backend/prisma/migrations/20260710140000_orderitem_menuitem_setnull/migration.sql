-- Permite excluir itens do cardápio sem apagar o histórico do pedido:
-- menuItemId passa a ser opcional e o FK usa ON DELETE SET NULL.
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_menuItemId_fkey";

ALTER TABLE "OrderItem" ALTER COLUMN "menuItemId" DROP NOT NULL;

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
