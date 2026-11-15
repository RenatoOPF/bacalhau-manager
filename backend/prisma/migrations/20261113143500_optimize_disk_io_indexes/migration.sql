-- CreateIndex (composite indexes on Order to reduce heap scans on reports, kitchen, cashier, and courier queries)
CREATE INDEX IF NOT EXISTS "Order_createdAt_status_idx" ON "Order"("createdAt", "status");
CREATE INDEX IF NOT EXISTS "Order_paymentStatus_paidAt_idx" ON "Order"("paymentStatus", "paidAt");
CREATE INDEX IF NOT EXISTS "Order_courierId_createdAt_idx" ON "Order"("courierId", "createdAt");

-- Trigram indexes for fast ILIKE/contains searches on Customer
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "Customer_name_trgm_idx" ON "Customer" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Customer_phone_trgm_idx" ON "Customer" USING GIN ("phone" gin_trgm_ops);
