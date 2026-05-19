import { NextResponse } from "next/server";
import { addRecipientsSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";

export const runtime = "nodejs";

/** Add leads as recipients of a campaign (skips leads already enrolled). */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();

  const campaign = await prisma.campaign.findFirst({
    where: { id, userId: user.id },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = addRecipientsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Only enroll leads that belong to the user.
  const leads = await prisma.lead.findMany({
    where: { id: { in: parsed.data.leadIds }, userId: user.id },
    select: { id: true },
  });

  const result = await prisma.campaignRecipient.createMany({
    data: leads.map((l) => ({ campaignId: id, leadId: l.id })),
    skipDuplicates: true,
  });

  return NextResponse.json({ added: result.count }, { status: 201 });
}
