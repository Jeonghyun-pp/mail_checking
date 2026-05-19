-- CreateEnum
CREATE TYPE "WarmupEventType" AS ENUM ('SENT', 'RECEIVED', 'OPENED', 'REPLIED');

-- AlterTable
ALTER TABLE "EmailAccount" ADD COLUMN     "warmupStartedAt" TIMESTAMP(3),
ADD COLUMN     "warmupTarget" INTEGER NOT NULL DEFAULT 40;

-- CreateTable
CREATE TABLE "WarmupEvent" (
    "id" TEXT NOT NULL,
    "type" "WarmupEventType" NOT NULL,
    "peerEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountId" TEXT NOT NULL,

    CONSTRAINT "WarmupEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WarmupEvent_accountId_idx" ON "WarmupEvent"("accountId");

-- CreateIndex
CREATE INDEX "WarmupEvent_createdAt_idx" ON "WarmupEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "WarmupEvent" ADD CONSTRAINT "WarmupEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
