import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function page(message: string): Response {
  const html = `<!doctype html><html><head><meta charset="utf-8">
<title>Unsubscribe</title></head>
<body style="font-family:Arial,sans-serif;max-width:480px;margin:80px auto;text-align:center;color:#1a1d21">
<h2>${message}</h2>
<p style="color:#6b7280">You will no longer receive emails from this sender.</p>
</body></html>`;
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/**
 * One-click unsubscribe. Suppresses the lead globally and stops them in
 * every campaign they are currently enrolled in.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ recipientId: string }> },
) {
  const { recipientId } = await params;

  const recipient = await prisma.campaignRecipient.findUnique({
    where: { id: recipientId },
    include: { lead: true },
  });
  if (!recipient) {
    return page("Link not recognized");
  }

  await prisma.$transaction([
    prisma.lead.update({
      where: { id: recipient.leadId },
      data: { unsubscribed: true, unsubscribedAt: new Date() },
    }),
    // Stop this lead in every campaign that is still sending to them.
    prisma.campaignRecipient.updateMany({
      where: { leadId: recipient.leadId, status: { in: ["PENDING", "ACTIVE"] } },
      data: { status: "UNSUBSCRIBED", nextSendAt: null },
    }),
  ]);

  return page("You've been unsubscribed");
}
