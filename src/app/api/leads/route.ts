import { NextResponse } from "next/server";
import { createLeadSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";
import { fireWebhooks } from "@/lib/webhooks";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  const leads = await prisma.lead.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ leads });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = createLeadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const user = await getCurrentUser();
  const { email, ...rest } = parsed.data;
  const domain = email.split("@")[1] ?? null;

  const existing = await prisma.lead.findUnique({
    where: { userId_email: { userId: user.id, email } },
    select: { id: true },
  });

  const lead = await prisma.lead.upsert({
    where: { userId_email: { userId: user.id, email } },
    update: { ...rest, domain },
    create: { ...rest, email, domain, userId: user.id },
  });

  if (!existing) {
    void fireWebhooks(user.id, "LEAD_CREATED", lead);
  }
  return NextResponse.json({ lead }, { status: 201 });
}
