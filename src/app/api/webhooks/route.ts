import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";

export const runtime = "nodejs";

const createSchema = z.object({
  url: z.string().url().max(500),
  event: z.enum(["LEAD_CREATED", "CAMPAIGN_REPLIED", "DEAL_WON"]),
});

export async function GET() {
  const user = await getCurrentUser();
  const webhooks = await prisma.webhook.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ webhooks });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const user = await getCurrentUser();
  const webhook = await prisma.webhook.create({
    data: { ...parsed.data, userId: user.id },
  });
  return NextResponse.json({ webhook }, { status: 201 });
}
