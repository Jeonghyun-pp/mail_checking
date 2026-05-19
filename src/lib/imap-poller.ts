import { ImapFlow } from "imapflow";
import type { EmailAccount } from "@prisma/client";
import { prisma } from "./prisma";
import { fireWebhooks } from "./webhooks";

export interface ReplyCheckSummary {
  accountsChecked: number;
  repliesFound: number;
}

const DAY_MS = 24 * 3600_000;

/**
 * Poll the INBOX of every IMAP-configured mailbox. When an inbound message
 * comes from a campaign recipient's address, that recipient is marked REPLIED
 * and their sequence stops.
 */
export async function runReplyCheck(): Promise<ReplyCheckSummary> {
  const accounts = await prisma.emailAccount.findMany({
    where: {
      imapHost: { not: null },
      imapUser: { not: null },
      imapPassword: { not: null },
    },
  });

  const summary: ReplyCheckSummary = {
    accountsChecked: 0,
    repliesFound: 0,
  };

  for (const account of accounts) {
    try {
      summary.repliesFound += await checkAccount(account);
      summary.accountsChecked += 1;
    } catch (err) {
      console.error(
        `[imap] ${account.fromEmail}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return summary;
}

async function checkAccount(account: EmailAccount): Promise<number> {
  const client = new ImapFlow({
    host: account.imapHost!,
    port: account.imapPort ?? 993,
    secure: account.imapSecure,
    auth: { user: account.imapUser!, pass: account.imapPassword! },
    logger: false,
  });

  await client.connect();
  const checkpoint = new Date();
  const since = account.imapLastCheckedAt ?? new Date(Date.now() - DAY_MS);
  let replies = 0;

  const lock = await client.getMailboxLock("INBOX");
  try {
    // Collect sender addresses of messages received since the last check.
    const uids = await client.search({ since }, { uid: true });
    const senders = new Set<string>();
    if (uids && uids.length > 0) {
      for await (const msg of client.fetch(
        uids,
        { envelope: true },
        { uid: true },
      )) {
        const addr = msg.envelope?.from?.[0]?.address?.toLowerCase();
        if (addr) senders.add(addr);
      }
    }

    for (const sender of senders) {
      // Recipients of this account's campaigns who are still in-sequence.
      const recipients = await prisma.campaignRecipient.findMany({
        where: {
          campaign: { emailAccountId: account.id },
          lead: { email: sender },
          status: { in: ["PENDING", "ACTIVE", "FINISHED"] },
        },
        select: { id: true },
      });
      for (const r of recipients) {
        await prisma.campaignRecipient.update({
          where: { id: r.id },
          data: { status: "REPLIED", nextSendAt: null },
        });
        await prisma.emailEvent.create({
          data: { type: "REPLIED", recipientId: r.id },
        });
        void fireWebhooks(account.userId, "CAMPAIGN_REPLIED", {
          recipientId: r.id,
          from: sender,
        });
        replies += 1;
      }
    }
  } finally {
    lock.release();
  }

  await client.logout();
  await prisma.emailAccount.update({
    where: { id: account.id },
    data: { imapLastCheckedAt: checkpoint },
  });
  return replies;
}
