import { NextResponse } from "next/server";
import { updateTaskSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";

export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  const body = await req.json().catch(() => null);
  const parsed = updateTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { title, done, dueAt } = parsed.data;

  const result = await prisma.task.updateMany({
    where: { id, userId: user.id },
    data: {
      ...(title !== undefined && { title }),
      ...(done !== undefined && { done }),
      ...(dueAt !== undefined && { dueAt: dueAt ? new Date(dueAt) : null }),
    },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  const result = await prisma.task.deleteMany({
    where: { id, userId: user.id },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
