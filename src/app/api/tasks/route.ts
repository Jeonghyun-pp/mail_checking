import { NextResponse } from "next/server";
import { createTaskSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";

export const runtime = "nodejs";

/** List tasks — optionally scoped to a deal (?dealId) or lead (?leadId). */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  const { searchParams } = new URL(req.url);
  const dealId = searchParams.get("dealId");
  const leadId = searchParams.get("leadId");

  const tasks = await prisma.task.findMany({
    where: {
      userId: user.id,
      ...(dealId && { dealId }),
      ...(leadId && { leadId }),
    },
    orderBy: [{ done: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
    include: { deal: { select: { id: true, title: true } } },
    take: 200,
  });
  return NextResponse.json({ tasks });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = createTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { title, dueAt, dealId, leadId } = parsed.data;
  const user = await getCurrentUser();

  const task = await prisma.task.create({
    data: {
      title,
      dueAt: dueAt ? new Date(dueAt) : null,
      dealId: dealId ?? null,
      leadId: leadId ?? null,
      userId: user.id,
    },
  });
  return NextResponse.json({ task }, { status: 201 });
}
