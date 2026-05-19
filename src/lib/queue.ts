import { Queue } from "bullmq";
import { redis } from "./redis";

export const CAMPAIGN_QUEUE = "campaign";

const globalForCampaignQueue = globalThis as unknown as {
  campaignQueue: Queue | undefined;
};

/** Queue carrying the repeatable campaign-sending tick. */
export const campaignQueue =
  globalForCampaignQueue.campaignQueue ??
  new Queue(CAMPAIGN_QUEUE, { connection: redis });

if (process.env.NODE_ENV !== "production") {
  globalForCampaignQueue.campaignQueue = campaignQueue;
}

/** Job payloads for the shared bulk-processing queue. */
export interface BulkVerifyJob {
  kind: "verify";
  bulkJobId: string;
}

export interface BulkFindJob {
  kind: "find";
  bulkJobId: string;
}

export type BulkJobPayload = BulkVerifyJob | BulkFindJob;

export const BULK_QUEUE = "bulk";

const globalForQueue = globalThis as unknown as {
  bulkQueue: Queue<BulkJobPayload> | undefined;
};

export const bulkQueue =
  globalForQueue.bulkQueue ??
  new Queue<BulkJobPayload>(BULK_QUEUE, { connection: redis });

if (process.env.NODE_ENV !== "production") {
  globalForQueue.bulkQueue = bulkQueue;
}
