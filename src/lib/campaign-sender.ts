import { prisma } from "./prisma";
import { sendMail } from "./mailer";
import { renderTemplate, toTrackedHtml } from "./render";

const HOUR_MS = 3600_000;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Count messages already sent today through a given mailbox. */
async function countSentToday(accountId: string): Promise<number> {
  return prisma.emailEvent.count({
    where: {
      type: "SENT",
      createdAt: { gte: startOfToday() },
      recipient: { campaign: { emailAccountId: accountId } },
    },
  });
}

export interface TickSummary {
  considered: number;
  sent: number;
  skippedLimit: number;
  failed: number;
}

/**
 * One sending pass: deliver the due step for every active recipient whose
 * `nextSendAt` has passed, then advance them through the drip sequence.
 * Designed to be called on a repeating schedule (~every minute).
 */
export async function runCampaignTick(): Promise<TickSummary> {
  const now = new Date();
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  const recipients = await prisma.campaignRecipient.findMany({
    where: {
      status: "ACTIVE",
      nextSendAt: { lte: now },
      campaign: { status: "ACTIVE" },
    },
    include: {
      lead: true,
      campaign: {
        include: {
          steps: { orderBy: { order: "asc" } },
          emailAccount: true,
        },
      },
    },
    orderBy: { nextSendAt: "asc" },
    take: 200,
  });

  const summary: TickSummary = {
    considered: recipients.length,
    sent: 0,
    skippedLimit: 0,
    failed: 0,
  };
  const sentToday = new Map<string, number>();

  for (const r of recipients) {
    const { campaign, lead } = r;
    const account = campaign.emailAccount;
    if (!account) continue; // campaign has no mailbox configured

    // Globally unsubscribed leads are suppressed from every campaign.
    if (lead.unsubscribed) {
      await prisma.campaignRecipient.update({
        where: { id: r.id },
        data: { status: "UNSUBSCRIBED", nextSendAt: null },
      });
      continue;
    }

    const step = campaign.steps[r.currentStep];
    if (!step) {
      await prisma.campaignRecipient.update({
        where: { id: r.id },
        data: { status: "FINISHED", nextSendAt: null },
      });
      continue;
    }

    // Respect the mailbox's daily sending limit.
    let count = sentToday.get(account.id);
    if (count === undefined) count = await countSentToday(account.id);
    if (count >= account.dailyLimit) {
      summary.skippedLimit += 1;
      continue;
    }

    // A/B test: when the step has a B variant, pick one at random per send.
    const hasVariantB = !!step.subjectB && !!step.bodyB;
    const useB = hasVariantB && Math.random() < 0.5;
    const variant = useB ? "B" : "A";
    const rawSubject = useB ? step.subjectB! : step.subject;
    const rawBody = useB ? step.bodyB! : step.body;

    const subject = renderTemplate(rawSubject, lead);
    const bodyText = renderTemplate(rawBody, lead);
    const html = toTrackedHtml(bodyText, {
      recipientId: r.id,
      stepId: step.id,
      appUrl,
    });

    try {
      await sendMail(account, { to: lead.email, subject, html, text: bodyText });
      await prisma.emailEvent.create({
        data: {
          type: "SENT",
          recipientId: r.id,
          stepId: step.id,
          meta: { variant },
        },
      });
      sentToday.set(account.id, count + 1);
      summary.sent += 1;

      const nextIndex = r.currentStep + 1;
      if (nextIndex < campaign.steps.length) {
        const next = campaign.steps[nextIndex];
        await prisma.campaignRecipient.update({
          where: { id: r.id },
          data: {
            currentStep: nextIndex,
            nextSendAt: new Date(Date.now() + next.delayHours * HOUR_MS),
          },
        });
      } else {
        await prisma.campaignRecipient.update({
          where: { id: r.id },
          data: { status: "FINISHED", nextSendAt: null },
        });
      }
    } catch (err) {
      summary.failed += 1;
      await prisma.emailEvent.create({
        data: {
          type: "BOUNCED",
          recipientId: r.id,
          stepId: step.id,
          meta: { error: err instanceof Error ? err.message : String(err) },
        },
      });
      await prisma.campaignRecipient.update({
        where: { id: r.id },
        data: { status: "BOUNCED", nextSendAt: null },
      });
    }
  }

  await completeFinishedCampaigns();
  return summary;
}

/** Mark active campaigns COMPLETED once no recipients remain in flight. */
async function completeFinishedCampaigns(): Promise<void> {
  const active = await prisma.campaign.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      _count: { select: { recipients: { where: { status: "ACTIVE" } } } },
    },
  });
  const done = active
    .filter((c) => c._count.recipients === 0)
    .map((c) => c.id);
  if (done.length > 0) {
    await prisma.campaign.updateMany({
      where: { id: { in: done } },
      data: { status: "COMPLETED" },
    });
  }
}
