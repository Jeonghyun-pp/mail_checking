import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";

export const runtime = "nodejs";

const patchSchema = z.object({
  warmupOn: z.boolean().optional(),
  warmupTarget: z.number().int().min(5).max(200).optional(),
});

/** Toggle warm-up or adjust its target for a mailbox. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  const account = await prisma.emailAccount.findFirst({
    where: { id, userId: user.id },
  });
  if (!account) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { warmupOn, warmupTarget } = parsed.data;

  await prisma.emailAccount.update({
    where: { id },
    data: {
      ...(warmupTarget !== undefined && { warmupTarget }),
      ...(warmupOn !== undefined && { warmupOn }),
      // Start (or reset) the ramp clock the first time warm-up is enabled.
      ...(warmupOn && !account.warmupStartedAt
        ? { warmupStartedAt: new Date() }
        : {}),
    },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  const result = await prisma.emailAccount.deleteMany({
    where: { id, userId: user.id },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
