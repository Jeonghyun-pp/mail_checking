import "dotenv/config";
import { Worker } from "bullmq";
import type { Prisma } from "@prisma/client";
import pLimit from "p-limit";
import { redis } from "../lib/redis";
import { prisma } from "../lib/prisma";
import {
  BULK_QUEUE,
  CAMPAIGN_QUEUE,
  campaignQueue,
  type BulkJobPayload,
} from "../lib/queue";
import { verifyEmail } from "../lib/verify/verifier";
import { findEmail } from "../lib/finder/finder";
import { runCampaignTick } from "../lib/campaign-sender";
import { runReplyCheck } from "../lib/imap-poller";
import { runWarmupTick, runWarmupInbox } from "../lib/warmup";

// Probe a handful of addresses at a time — too much parallelism trips
// rate limits on the receiving mail servers.
const CONCURRENCY = 5;

interface FindRow {
  firstName: string;
  lastName: string;
  domain: string;
}

async function runVerify(bulkJobId: string) {
  const job = await prisma.bulkJob.findUniqueOrThrow({
    where: { id: bulkJobId },
  });
  const emails = (job.input as unknown as string[]) ?? [];
  const limit = pLimit(CONCURRENCY);
  let processed = 0;
  const counts: Record<string, number> = {};

  await Promise.all(
    emails.map((email) =>
      limit(async () => {
        const outcome = await verifyEmail(email);
        await prisma.verificationResult.create({
          data: {
            email: outcome.email,
            status: outcome.status,
            score: outcome.score,
            reason: outcome.reason,
            checks: outcome.checks as unknown as Prisma.InputJsonValue,
            bulkJobId,
          },
        });
        counts[outcome.status] = (counts[outcome.status] ?? 0) + 1;
        processed += 1;
        if (processed % 10 === 0 || processed === emails.length) {
          await prisma.bulkJob.update({
            where: { id: bulkJobId },
            data: { processed },
          });
        }
      }),
    ),
  );

  await prisma.bulkJob.update({
    where: { id: bulkJobId },
    data: { status: "DONE", processed, result: counts },
  });
}

async function runFind(bulkJobId: string) {
  const job = await prisma.bulkJob.findUniqueOrThrow({
    where: { id: bulkJobId },
  });
  const rows = (job.input as unknown as FindRow[]) ?? [];
  const limit = pLimit(CONCURRENCY);
  let processed = 0;
  const results: unknown[] = new Array(rows.length);

  await Promise.all(
    rows.map((row, i) =>
      limit(async () => {
        const res = await findEmail(row.firstName, row.lastName, row.domain);
        results[i] = {
          query: res.query,
          email: res.best?.email ?? null,
          status: res.best?.verify.status ?? null,
          confidence: res.best?.confidence ?? 0,
          reason: res.reason,
        };
        processed += 1;
        if (processed % 10 === 0 || processed === rows.length) {
          await prisma.bulkJob.update({
            where: { id: bulkJobId },
            data: { processed },
          });
        }
      }),
    ),
  );

  await prisma.bulkJob.update({
    where: { id: bulkJobId },
    data: {
      status: "DONE",
      processed,
      result: { results } as unknown as Prisma.InputJsonValue,
    },
  });
}

const worker = new Worker<BulkJobPayload>(
  BULK_QUEUE,
  async (job) => {
    const { bulkJobId, kind } = job.data;
    await prisma.bulkJob.update({
      where: { id: bulkJobId },
      data: { status: "RUNNING" },
    });
    try {
      if (kind === "verify") await runVerify(bulkJobId);
      else await runFind(bulkJobId);
    } catch (err) {
      await prisma.bulkJob.update({
        where: { id: bulkJobId },
        data: {
          status: "FAILED",
          error: err instanceof Error ? err.message : String(err),
        },
      });
      throw err;
    }
  },
  { connection: redis, concurrency: 2 },
);

worker.on("completed", (job) =>
  console.log(`[worker] completed bulk job ${job.id}`),
);
worker.on("failed", (job, err) =>
  console.error(`[worker] failed bulk job ${job?.id}:`, err.message),
);

console.log("[worker] bulk queue worker started");

// --- Campaign sending: a tick runs every minute and delivers due steps. ---

const campaignWorker = new Worker(
  CAMPAIGN_QUEUE,
  async (job) => {
    if (job.name === "reply-check") {
      const r = await runReplyCheck();
      if (r.repliesFound > 0) {
        console.log(`[worker] reply check — ${r.repliesFound} new replies`);
      }
      return;
    }
    if (job.name === "warmup-send") {
      const w = await runWarmupTick();
      if (w.sent > 0) {
        console.log(`[worker] warm-up — sent ${w.sent} (pool ${w.poolSize})`);
      }
      return;
    }
    if (job.name === "warmup-inbox") {
      const w = await runWarmupInbox();
      if (w.processed > 0) {
        console.log(
          `[worker] warm-up inbox — ${w.processed} opened, ${w.replied} replied`,
        );
      }
      return;
    }
    // default: "tick"
    const summary = await runCampaignTick();
    if (summary.sent > 0 || summary.failed > 0) {
      console.log(
        `[worker] campaign tick — sent ${summary.sent}, failed ${summary.failed}, limit-skipped ${summary.skippedLimit}`,
      );
    }
  },
  { connection: redis, concurrency: 1 },
);

campaignWorker.on("failed", (job, err) =>
  console.error(`[worker] ${job?.name ?? "campaign"} job failed:`, err.message),
);

// Register the repeatable jobs (idempotent — keyed by stable names).
Promise.all([
  campaignQueue.add(
    "tick",
    {},
    { repeat: { every: 60_000 }, removeOnComplete: true, removeOnFail: 100 },
  ),
  campaignQueue.add(
    "reply-check",
    {},
    { repeat: { every: 300_000 }, removeOnComplete: true, removeOnFail: 100 },
  ),
  campaignQueue.add(
    "warmup-send",
    {},
    { repeat: { every: 60_000 }, removeOnComplete: true, removeOnFail: 100 },
  ),
  campaignQueue.add(
    "warmup-inbox",
    {},
    { repeat: { every: 300_000 }, removeOnComplete: true, removeOnFail: 100 },
  ),
])
  .then(() =>
    console.log(
      "[worker] campaign + warm-up workers started",
    ),
  )
  .catch((err) =>
    console.error("[worker] failed to schedule campaign tick:", err),
  );
