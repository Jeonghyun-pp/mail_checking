import { NextResponse } from "next/server";
import { createPipelineSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";

export const runtime = "nodejs";

const DEFAULT_STAGES = ["Lead In", "Contacted", "Proposal", "Won", "Lost"];

export async function GET() {
  const user = await getCurrentUser();
  const pipelines = await prisma.pipeline.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    include: {
      stages: { orderBy: { order: "asc" } },
      _count: { select: { deals: true } },
    },
  });
  return NextResponse.json({ pipelines });
}

/** Create a pipeline pre-populated with a default set of stages. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = createPipelineSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const user = await getCurrentUser();
  const pipeline = await prisma.pipeline.create({
    data: {
      name: parsed.data.name,
      userId: user.id,
      stages: {
        create: DEFAULT_STAGES.map((name, order) => ({ name, order })),
      },
    },
    include: { stages: { orderBy: { order: "asc" } } },
  });
  return NextResponse.json({ pipeline }, { status: 201 });
}
