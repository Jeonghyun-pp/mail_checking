import { NextResponse } from "next/server";
import { createLeadSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/apikey";
import { fireWebhooks } from "@/lib/webhooks";

export const runtime = "nodejs";

/** Public API — list leads for the API key's workspace. */
export async function GET(req: Request) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const leads = await prisma.lead.findMany({
    where: { userId: auth.userId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ leads });
}

/** Public API — create (or upsert) a lead. */
export async function POST(req: Request) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json().catch(() => null);
  const parsed = createLeadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { email, ...rest } = parsed.data;
  const domain = email.split("@")[1] ?? null;
  const userId = auth.userId!;

  const existing = await prisma.lead.findUnique({
    where: { userId_email: { userId, email } },
    select: { id: true },
  });

  const lead = await prisma.lead.upsert({
    where: { userId_email: { userId, email } },
    update: { ...rest, domain },
    create: { ...rest, email, domain, source: rest.source ?? "api", userId },
  });

  if (!existing) {
    void fireWebhooks(userId, "LEAD_CREATED", lead);
  }
  return NextResponse.json({ lead }, { status: 201 });
}
