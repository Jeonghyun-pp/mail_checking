import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";
import { rampQuota } from "@/lib/warmup";

export const runtime = "nodejs";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Warm-up dashboard data: every mailbox with its ramp quota and counters. */
export async function GET() {
  const user = await getCurrentUser();
  const accounts = await prisma.emailAccount.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    omit: { smtpPassword: true, imapPassword: true },
  });

  const today = startOfToday();
  const rows = await Promise.all(
    accounts.map(async (a) => {
      const [sentToday, totalSent, totalReplies] = await Promise.all([
        prisma.warmupEvent.count({
          where: { accountId: a.id, type: "SENT", createdAt: { gte: today } },
        }),
        prisma.warmupEvent.count({
          where: { accountId: a.id, type: "SENT" },
        }),
        prisma.warmupEvent.count({
          where: { accountId: a.id, type: "REPLIED" },
        }),
      ]);
      return {
        id: a.id,
        fromName: a.fromName,
        fromEmail: a.fromEmail,
        warmupOn: a.warmupOn,
        warmupTarget: a.warmupTarget,
        warmupStartedAt: a.warmupStartedAt,
        quotaToday: rampQuota(a),
        sentToday,
        totalSent,
        totalReplies,
      };
    }),
  );

  return NextResponse.json({ accounts: rows });
}
