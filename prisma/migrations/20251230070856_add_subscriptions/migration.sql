-- AlterTable
ALTER TABLE "Session" ALTER COLUMN "expires" SET DATA TYPE TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SubscriptionPlan" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "discountValue" DOUBLE PRECISION NOT NULL,
    "interval" TEXT NOT NULL,
    "shopifyPlanId" TEXT,
    "shop" TEXT NOT NULL,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionContract" (
    "id" TEXT NOT NULL,
    "shopifyContractId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "nextBillingDate" TIMESTAMP(3) NOT NULL,
    "shop" TEXT NOT NULL,

    CONSTRAINT "SubscriptionContract_pkey" PRIMARY KEY ("id")
);
