import { NextResponse } from "next/server";
import { updateDealSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";

export const runtime = "nodejs";

async function ownedDeal(id: string) {
  const user = await getCurrentUser();
  return prisma.deal.findFirst({
    where: { id, pipeline: { userId: user.id } },
    include: { stage: true },
  });
}

/** Deal detail: stage, lead, tasks and the activity timeline. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!(await ownedDeal(id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const deal = await prisma.deal.findUnique({
    where: { id },
    include: {
      lead: true,
      stage: true,
      pipeline: { include: { stages: { orderBy: { order: "asc" } } } },
      tasks: { orderBy: [{ done: "asc" }, { dueAt: "asc" }] },
      activities: { orderBy: { createdAt: "desc" } },
    },
  });
  return NextResponse.json({ deal });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const current = await ownedDeal(id);
  if (!current) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = await req.json().catch(() => null);
  const parsed = updateDealSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { title, value, stageId, leadId } = parsed.data;
  const user = await getCurrentUser();

  // A stage move must stay within the same pipeline.
  if (stageId && stageId !== current.stageId) {
    const stage = await prisma.stage.findFirst({
      where: { id: stageId, pipelineId: current.pipelineId },
    });
    if (!stage) {
      return NextResponse.json({ error: "Unknown stage" }, { status: 400 });
    }
  }

  await prisma.deal.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(value !== undefined && { value }),
      ...(stageId !== undefined && { stageId }),
      ...(leadId !== undefined && { leadId }),
    },
  });

  // Record stage moves on the activity timeline.
  if (stageId && stageId !== current.stageId) {
    const to = await prisma.stage.findUnique({ where: { id: stageId } });
    await prisma.activity.create({
      data: {
        type: "STAGE_CHANGE",
        content: `Moved from "${current.stage.name}" to "${to?.name ?? "?"}"`,
        dealId: id,
        userId: user.id,
      },
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!(await ownedDeal(id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await prisma.deal.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
