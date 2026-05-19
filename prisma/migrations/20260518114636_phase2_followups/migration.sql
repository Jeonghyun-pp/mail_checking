-- AlterTable
ALTER TABLE "CampaignStep" ADD COLUMN     "bodyB" TEXT,
ADD COLUMN     "subjectB" TEXT;

-- AlterTable
ALTER TABLE "EmailAccount" ADD COLUMN     "imapHost" TEXT,
ADD COLUMN     "imapLastCheckedAt" TIMESTAMP(3),
ADD COLUMN     "imapPassword" TEXT,
ADD COLUMN     "imapPort" INTEGER DEFAULT 993,
ADD COLUMN     "imapSecure" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "imapUser" TEXT;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "unsubscribed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "unsubscribedAt" TIMESTAMP(3);
