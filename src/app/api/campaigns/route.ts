import { NextResponse } from "next/server";
import { createCampaignSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  const campaigns = await prisma.campaign.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { recipients: true, steps: true } },
    },
  });
  return NextResponse.json({ campaigns });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = createCampaignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const user = await getCurrentUser();
  const campaign = await prisma.campaign.create({
    data: {
      name: parsed.data.name,
      userId: user.id,
      steps: {
        create: {
          order: 0,
          delayHours: 0,
          subject: "Hi {{firstName}}",
          body: "Hi {{firstName}},\n\nWrite your message here.\n\nBest,",
        },
      },
    },
  });
  return NextResponse.json({ campaign }, { status: 201 });
}
