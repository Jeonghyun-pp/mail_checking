import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/** Click-tracking redirect. Records a CLICKED event, then forwards the user. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ recipientId: string; stepId: string }> },
) {
  const { recipientId, stepId } = await params;
  const target = new URL(req.url).searchParams.get("url");

  if (!target || !/^https?:\/\//i.test(target)) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  try {
    const sent = await prisma.emailEvent.findFirst({
      where: { type: "SENT", recipientId, stepId },
      select: { meta: true },
    });
    const variant = (sent?.meta as { variant?: string } | null)?.variant;

    await prisma.emailEvent.create({
      data: {
        type: "CLICKED",
        recipientId,
        stepId,
        meta: variant ? { url: target, variant } : { url: target },
      },
    });
    // A click implies an open — backfill it if the pixel never loaded.
    const opened = await prisma.emailEvent.findFirst({
      where: { type: "OPENED", recipientId, stepId },
      select: { id: true },
    });
    if (!opened) {
      await prisma.emailEvent.create({
        data: {
          type: "OPENED",
          recipientId,
          stepId,
          meta: variant ? { variant } : undefined,
        },
      });
    }
  } catch {
    // Unknown recipient/step — still redirect.
  }

  return NextResponse.redirect(target, 302);
}
