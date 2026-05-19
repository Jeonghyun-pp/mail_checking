import { NextResponse } from "next/server";
import { createDealSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = createDealSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { title, value, pipelineId, stageId, leadId } = parsed.data;
  const user = await getCurrentUser();

  // The stage must belong to a pipeline the user owns.
  const stage = await prisma.stage.findFirst({
    where: { id: stageId, pipelineId, pipeline: { userId: user.id } },
  });
  if (!stage) {
    return NextResponse.json(
      { error: "Unknown pipeline or stage" },
      { status: 400 },
    );
  }
  if (leadId) {
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, userId: user.id },
    });
    if (!lead) {
      return NextResponse.json({ error: "Unknown lead" }, { status: 400 });
    }
  }

  const deal = await prisma.deal.create({
    data: { title, value, pipelineId, stageId, leadId: leadId ?? null },
  });
  return NextResponse.json({ deal }, { status: 201 });
}
