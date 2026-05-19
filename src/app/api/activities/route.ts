import { NextResponse } from "next/server";
import { createActivitySchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";

export const runtime = "nodejs";

/** Add a note/call/email/meeting entry to a deal or lead timeline. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = createActivitySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { type, content, dealId, leadId } = parsed.data;
  if (!dealId && !leadId) {
    return NextResponse.json(
      { error: "An activity must reference a deal or a lead" },
      { status: 400 },
    );
  }
  const user = await getCurrentUser();

  const activity = await prisma.activity.create({
    data: {
      type,
      content,
      dealId: dealId ?? null,
      leadId: leadId ?? null,
      userId: user.id,
    },
  });
  return NextResponse.json({ activity }, { status: 201 });
}
