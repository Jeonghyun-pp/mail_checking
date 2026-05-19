import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";

export const runtime = "nodejs";

/** Fetch a single bulk job with its verification rows (if any). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();

  const job = await prisma.bulkJob.findFirst({
    where: { id, userId: user.id },
    include: {
      verifications: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ job });
}
