import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// 1x1 transparent GIF.
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

const PIXEL_HEADERS = {
  "Content-Type": "image/gif",
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
};

/** Open-tracking pixel. Records one unique OPENED event per recipient+step. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ recipientId: string; stepId: string }> },
) {
  const { recipientId, stepId } = await params;

  try {
    const existing = await prisma.emailEvent.findFirst({
      where: { type: "OPENED", recipientId, stepId },
      select: { id: true },
    });
    if (!existing) {
      // Carry over the A/B variant from the original send for analytics.
      const sent = await prisma.emailEvent.findFirst({
        where: { type: "SENT", recipientId, stepId },
        select: { meta: true },
      });
      const variant = (sent?.meta as { variant?: string } | null)?.variant;
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
    // Unknown recipient/step — still serve the pixel.
  }

  return new Response(new Uint8Array(PIXEL), { headers: PIXEL_HEADERS });
}
