-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "addressLat" DOUBLE PRECISION,
ADD COLUMN     "addressLng" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "RecipeIngredient" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "RecipeSheet" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "DeliveryFeeZone" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "maxKm" DOUBLE PRECISION NOT NULL,
    "feeCents" INTEGER NOT NULL,
    "courierFeeCents" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryFeeZone_pkey" PRIMARY KEY ("id")
);
