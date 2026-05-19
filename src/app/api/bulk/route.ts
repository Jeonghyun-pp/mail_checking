import { NextResponse } from "next/server";
import { bulkSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";
import { bulkQueue } from "@/lib/queue";

export const runtime = "nodejs";

/** List the current user's bulk jobs, newest first. */
export async function GET() {
  const user = await getCurrentUser();
  const jobs = await prisma.bulkJob.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ jobs });
}

/** Create a bulk verify/find job and enqueue it for the worker. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const user = await getCurrentUser();
  const data = parsed.data;
  const isVerify = data.type === "verify";
  const input = isVerify ? data.emails : data.rows;

  const job = await prisma.bulkJob.create({
    data: {
      userId: user.id,
      type: isVerify ? "VERIFY" : "FIND",
      status: "QUEUED",
      total: input.length,
      input,
    },
  });

  await bulkQueue.add(job.type, {
    kind: isVerify ? "verify" : "find",
    bulkJobId: job.id,
  });

  return NextResponse.json({ job }, { status: 201 });
}
