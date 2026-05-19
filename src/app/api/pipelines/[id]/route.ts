import { NextResponse } from "next/server";
import { createPipelineSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";

export const runtime = "nodejs";

async function owned(id: string) {
  const user = await getCurrentUser();
  return prisma.pipeline.findFirst({ where: { id, userId: user.id } });
}

/** Full board: stages, each with their deals (newest first). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!(await owned(id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const pipeline = await prisma.pipeline.findUnique({
    where: { id },
    include: {
      stages: {
        orderBy: { order: "asc" },
        include: {
          deals: {
            orderBy: { createdAt: "desc" },
            include: {
              lead: true,
              _count: { select: { tasks: { where: { done: false } } } },
            },
          },
        },
      },
    },
  });
  return NextResponse.json({ pipeline });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!(await owned(id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = await req.json().catch(() => null);
  const parsed = createPipelineSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  await prisma.pipeline.update({
    where: { id },
    data: { name: parsed.data.name },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!(await owned(id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await prisma.pipeline.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
