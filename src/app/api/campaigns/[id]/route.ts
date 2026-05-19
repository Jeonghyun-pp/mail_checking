import { NextResponse } from "next/server";
import { updateCampaignSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";

export const runtime = "nodejs";

async function ownedCampaign(id: string) {
  const user = await getCurrentUser();
  return prisma.campaign.findFirst({ where: { id, userId: user.id } });
}

/** Full campaign detail: steps, recipients (+lead), email account. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!(await ownedCampaign(id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      steps: { orderBy: { order: "asc" } },
      emailAccount: { omit: { smtpPassword: true } },
      recipients: {
        include: { lead: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  // Aggregate engagement events into a stats summary.
  const grouped = await prisma.emailEvent.groupBy({
    by: ["type"],
    where: { recipient: { campaignId: id } },
    _count: { _all: true },
  });
  const stats = { SENT: 0, OPENED: 0, CLICKED: 0, REPLIED: 0, BOUNCED: 0 };
  for (const g of grouped) {
    stats[g.type] = g._count._all;
  }

  // Per-step A/B breakdown for steps that have a B variant.
  const abSteps = (campaign?.steps ?? []).filter((s) => s.subjectB && s.bodyB);
  const countVariant = (stepId: string, variant: "A" | "B", type: string) =>
    prisma.emailEvent.count({
      where: {
        stepId,
        type: type as "SENT" | "OPENED" | "CLICKED",
        meta: { path: ["variant"], equals: variant },
      },
    });
  const abStats = await Promise.all(
    abSteps.map(async (step) => {
      const [sa, oa, ca, sb, ob, cb] = await Promise.all([
        countVariant(step.id, "A", "SENT"),
        countVariant(step.id, "A", "OPENED"),
        countVariant(step.id, "A", "CLICKED"),
        countVariant(step.id, "B", "SENT"),
        countVariant(step.id, "B", "OPENED"),
        countVariant(step.id, "B", "CLICKED"),
      ]);
      return {
        stepId: step.id,
        A: { sent: sa, opened: oa, clicked: ca },
        B: { sent: sb, opened: ob, clicked: cb },
      };
    }),
  );

  return NextResponse.json({ campaign, stats, abStats });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!(await ownedCampaign(id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = updateCampaignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { name, emailAccountId, status, steps } = parsed.data;

  await prisma.$transaction(async (tx) => {
    if (name !== undefined || emailAccountId !== undefined || status) {
      await tx.campaign.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(emailAccountId !== undefined && { emailAccountId }),
          ...(status && { status }),
        },
      });
    }

    // Replace the whole step set when provided.
    if (steps) {
      await tx.campaignStep.deleteMany({ where: { campaignId: id } });
      await tx.campaignStep.createMany({
        data: steps.map((s) => ({ ...s, campaignId: id })),
      });
    }

    // Activating a campaign releases its pending recipients for sending.
    if (status === "ACTIVE") {
      await tx.campaignRecipient.updateMany({
        where: { campaignId: id, status: "PENDING" },
        data: { status: "ACTIVE", nextSendAt: new Date() },
      });
    }
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!(await ownedCampaign(id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await prisma.campaign.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
