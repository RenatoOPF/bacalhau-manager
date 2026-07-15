-- Taxa de entrega dos pedidos externos (iFood/99), inclusa no totalCents.
ALTER TABLE "Order" ADD COLUMN "deliveryFeeCents" INTEGER NOT NULL DEFAULT 0;
