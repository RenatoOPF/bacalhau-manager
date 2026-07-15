-- Número de pedido diário (reinicia por dia).
ALTER TABLE "Order" ADD COLUMN "dailyNumber" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "DailyCounter" (
    "date" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyCounter_pkey" PRIMARY KEY ("date")
);
