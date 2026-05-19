/**
 * Wipe all workspace data for a clean start — keeps only the owner account.
 * Destructive. Run with:  tsx scripts/cleanup-test-data.ts --confirm
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const OWNER = "owner@mail-checking.local";

async function main() {
  if (!process.argv.includes("--confirm")) {
    console.error("Refusing to run without --confirm (this deletes all data).");
    process.exit(1);
  }

  const before = {
    leads: await prisma.lead.count(),
    campaigns: await prisma.campaign.count(),
    pipelines: await prisma.pipeline.count(),
    deals: await prisma.deal.count(),
    mailboxes: await prisma.emailAccount.count(),
    users: await prisma.user.count(),
  };
  console.log("Before:", before);

  // Child-first deletion order — every FK is Cascade or SetNull, so this is safe.
  await prisma.activity.deleteMany();
  await prisma.task.deleteMany();
  await prisma.emailEvent.deleteMany();
  await prisma.campaignRecipient.deleteMany();
  await prisma.campaignStep.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.deal.deleteMany();
  await prisma.stage.deleteMany();
  await prisma.pipeline.deleteMany();
  await prisma.verificationResult.deleteMany();
  await prisma.bulkJob.deleteMany();
  await prisma.warmupEvent.deleteMany();
  await prisma.emailAccount.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.leadList.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.webhook.deleteMany();
  await prisma.inviteCode.deleteMany();
  await prisma.user.deleteMany({ where: { email: { not: OWNER } } });

  const after = {
    leads: await prisma.lead.count(),
    campaigns: await prisma.campaign.count(),
    pipelines: await prisma.pipeline.count(),
    deals: await prisma.deal.count(),
    mailboxes: await prisma.emailAccount.count(),
    users: await prisma.user.count(),
  };
  console.log("After: ", after);
  console.log(`Done — kept only ${OWNER}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
