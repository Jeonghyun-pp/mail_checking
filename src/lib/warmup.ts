import { ImapFlow } from "imapflow";
import type { EmailAccount, WarmupEventType } from "@prisma/client";
import { prisma } from "./prisma";
import { sendMail } from "./mailer";

const DAY_MS = 86400_000;
export const WARMUP_HEADER = "x-mailchecking-warmup";

// Short, human-sounding messages so warm-up traffic looks organic.
const TEMPLATES = [
  {
    subject: "Quick question about next week",
    body: "Hey,\n\nDo you have time to sync next week? Let me know what works for you.\n\nThanks",
  },
  {
    subject: "Following up on our chat",
    body: "Hi there,\n\nJust circling back on what we discussed. Happy to share more detail whenever.\n\nBest",
  },
  {
    subject: "Notes from today",
    body: "Hi,\n\nHere are my notes from earlier — let me know if anything looks off.\n\nCheers",
  },
  {
    subject: "Re: project update",
    body: "Thanks for the update — looks good on my end. Talk soon.",
  },
  {
    subject: "Coffee sometime?",
    body: "Hey,\n\nWould love to catch up over coffee. Are you around this week?\n\nTalk soon",
  },
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

type RampInput = Pick<
  EmailAccount,
  "warmupOn" | "warmupStartedAt" | "warmupTarget"
>;

/** Today's warm-up quota — ramps +2/day from 2 up to the account target. */
export function rampQuota(account: RampInput): number {
  if (!account.warmupOn || !account.warmupStartedAt) return 0;
  const day =
    Math.floor((Date.now() - account.warmupStartedAt.getTime()) / DAY_MS) + 1;
  return Math.min(account.warmupTarget, 2 + (day - 1) * 2);
}

function countToday(accountId: string, type: WarmupEventType): Promise<number> {
  return prisma.warmupEvent.count({
    where: { accountId, type, createdAt: { gte: startOfToday() } },
  });
}

export interface WarmupTickSummary {
  poolSize: number;
  sent: number;
}

/**
 * One warm-up pass: every enabled account that is under its daily quota
 * sends a single message to a random peer in the pool.
 */
export async function runWarmupTick(): Promise<WarmupTickSummary> {
  const pool = await prisma.emailAccount.findMany({
    where: { warmupOn: true },
  });
  const summary: WarmupTickSummary = { poolSize: pool.length, sent: 0 };
  if (pool.length < 2) return summary; // need at least one peer

  for (const account of pool) {
    const quota = rampQuota(account);
    if (quota <= 0) continue;
    if ((await countToday(account.id, "SENT")) >= quota) continue;

    const peer = pick(pool.filter((p) => p.id !== account.id));
    const tpl = pick(TEMPLATES);
    try {
      await sendMail(account, {
        to: peer.fromEmail,
        subject: tpl.subject,
        html: `<p>${tpl.body.replace(/\n/g, "<br>")}</p>`,
        text: tpl.body,
        headers: { [WARMUP_HEADER]: "1" },
      });
      await prisma.warmupEvent.create({
        data: { type: "SENT", peerEmail: peer.fromEmail, accountId: account.id },
      });
      summary.sent += 1;
    } catch (err) {
      console.error(
        `[warmup] send from ${account.fromEmail} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return summary;
}

export interface WarmupInboxSummary {
  processed: number;
  replied: number;
}

/**
 * IMAP side of warm-up: open incoming warm-up mail, rescue it from spam,
 * and reply to a portion so conversations look two-sided. Requires the
 * receiving account to have IMAP configured.
 */
export async function runWarmupInbox(): Promise<WarmupInboxSummary> {
  const accounts = await prisma.emailAccount.findMany({
    where: { warmupOn: true, imapHost: { not: null } },
  });
  const summary: WarmupInboxSummary = { processed: 0, replied: 0 };

  for (const account of accounts) {
    try {
      summary.processed += await processInbox(account, summary);
    } catch (err) {
      console.error(
        `[warmup] inbox ${account.fromEmail}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return summary;
}

async function processInbox(
  account: EmailAccount,
  summary: WarmupInboxSummary,
): Promise<number> {
  const client = new ImapFlow({
    host: account.imapHost!,
    port: account.imapPort ?? 993,
    secure: account.imapSecure,
    auth: { user: account.imapUser!, pass: account.imapPassword! },
    logger: false,
  });
  await client.connect();
  let processed = 0;

  try {
    // Rescue warm-up mail that landed in spam back to the inbox.
    for (const junk of ["Junk", "Spam", "[Gmail]/Spam"]) {
      try {
        const lock = await client.getMailboxLock(junk);
        try {
          const uids = await client.search(
            { header: { [WARMUP_HEADER]: "1" } },
            { uid: true },
          );
          if (uids && uids.length) {
            await client.messageMove(uids, "INBOX", { uid: true });
          }
        } finally {
          lock.release();
        }
      } catch {
        // mailbox doesn't exist on this provider — skip
      }
    }

    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = await client.search(
        { header: { [WARMUP_HEADER]: "1" }, seen: false },
        { uid: true },
      );
      if (uids && uids.length) {
        for await (const msg of client.fetch(
          uids,
          { envelope: true },
          { uid: true },
        )) {
          const from = msg.envelope?.from?.[0]?.address?.toLowerCase();
          await client.messageFlagsAdd(msg.uid, ["\\Seen"], { uid: true });
          processed += 1;

          if (from) {
            await prisma.warmupEvent.createMany({
              data: [
                { type: "RECEIVED", peerEmail: from, accountId: account.id },
                { type: "OPENED", peerEmail: from, accountId: account.id },
              ],
            });
            // Reply to ~40% and credit the original sender's account.
            if (Math.random() < 0.4) {
              await replyToPeer(account, from, msg.envelope?.subject ?? "");
              summary.replied += 1;
            }
          }
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
  return processed;
}

async function replyToPeer(
  replier: EmailAccount,
  peerEmail: string,
  subject: string,
): Promise<void> {
  const reply = pick([
    "Sounds good, thanks!",
    "Got it — appreciate the note.",
    "Perfect, talk soon.",
    "Thanks for letting me know.",
  ]);
  await sendMail(replier, {
    to: peerEmail,
    subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
    html: `<p>${reply}</p>`,
    text: reply,
    headers: { [WARMUP_HEADER]: "1" },
  });
  // The peer (original sender) is the one whose reputation gains a reply.
  const peer = await prisma.emailAccount.findFirst({
    where: { fromEmail: peerEmail },
  });
  if (peer) {
    await prisma.warmupEvent.create({
      data: {
        type: "REPLIED",
        peerEmail: replier.fromEmail,
        accountId: peer.id,
      },
    });
  }
}
