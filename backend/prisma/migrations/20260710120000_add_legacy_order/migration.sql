-- CreateTable
CREATE TABLE "LegacyOrder" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "status" TEXT,
    "createdBy" TEXT,
    "customerName" TEXT,
    "type" TEXT,
    "channel" TEXT,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegacyOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LegacyOrder_code_key" ON "LegacyOrder"("code");

-- CreateIndex
CREATE INDEX "LegacyOrder_openedAt_idx" ON "LegacyOrder"("openedAt");
