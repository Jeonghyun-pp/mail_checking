import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { getWorkspaceUser } from "./user";
import { verifyEmail } from "./verify/verifier";
import { findEmail } from "./finder/finder";
import { runDeliverabilityTest } from "./deliverability";
import { rampQuota } from "./warmup";
import { fireWebhooks } from "./webhooks";
import { bulkQueue } from "./queue";

// --- helpers ---------------------------------------------------------------

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

function ok(data: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

function fail(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/** Shared workspace user id — every record is scoped to it. */
async function wsId(): Promise<string> {
  return (await getWorkspaceUser()).id;
}

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Register all 28 mailchecking tools on an MCP server. Tools reuse the same
 * engine code as the web app and operate on the shared team workspace.
 */
export function registerMcpTools(server: McpServer) {
  // =========================================================================
  // 1. Email finding & verification
  // =========================================================================

  server.tool(
    "find_email",
    "Find a person's work email from their name and company domain. Returns the best guess plus all candidates with confidence scores.",
    {
      firstName: z.string().describe("Person's first name"),
      lastName: z.string().optional().describe("Person's last name"),
      domain: z.string().describe("Company domain, e.g. acme.com"),
    },
    async ({ firstName, lastName, domain }) => {
      const result = await findEmail(firstName, lastName ?? "", domain);
      return ok(result);
    },
  );

  server.tool(
    "verify_email",
    "Verify whether an email address is deliverable (syntax, MX, SMTP, catch-all). Returns status and a 0-100 score.",
    { email: z.string().describe("Email address to verify") },
    async ({ email }) => ok(await verifyEmail(email)),
  );

  // =========================================================================
  // 2. Leads
  // =========================================================================

  server.tool(
    "search_leads",
    "Search saved leads by keyword, company, verification status or source.",
    {
      query: z.string().optional().describe("Matches email / first / last name"),
      company: z.string().optional(),
      status: z
        .enum(["NOT_VERIFIED", "VALID", "INVALID", "CATCH_ALL", "RISKY", "UNKNOWN"])
        .optional(),
      source: z.string().optional(),
      limit: z.number().int().min(1).max(200).optional(),
    },
    async ({ query, company, status, source, limit }) => {
      const where: Prisma.LeadWhereInput = { userId: await wsId() };
      if (company) where.company = { contains: company, mode: "insensitive" };
      if (status) where.verifyStatus = status;
      if (source) where.source = source;
      if (query) {
        where.OR = [
          { email: { contains: query, mode: "insensitive" } },
          { firstName: { contains: query, mode: "insensitive" } },
          { lastName: { contains: query, mode: "insensitive" } },
        ];
      }
      const leads = await prisma.lead.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit ?? 50,
      });
      return ok({ count: leads.length, leads });
    },
  );

  server.tool(
    "get_lead",
    "Get one lead's full detail including its tasks and activity.",
    { leadId: z.string() },
    async ({ leadId }) => {
      const lead = await prisma.lead.findFirst({
        where: { id: leadId, userId: await wsId() },
        include: {
          tasks: { orderBy: { createdAt: "desc" } },
          activities: { orderBy: { createdAt: "desc" } },
        },
      });
      return lead ? ok(lead) : fail("Lead not found");
    },
  );

  server.tool(
    "create_lead",
    "Create (or update if the email already exists) a lead.",
    {
      email: z.string().email(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      company: z.string().optional(),
      position: z.string().optional(),
    },
    async ({ email, firstName, lastName, company, position }) => {
      const userId = await wsId();
      const lower = email.toLowerCase();
      const domain = lower.split("@")[1] ?? null;
      const existing = await prisma.lead.findUnique({
        where: { userId_email: { userId, email: lower } },
        select: { id: true },
      });
      const lead = await prisma.lead.upsert({
        where: { userId_email: { userId, email: lower } },
        update: { firstName, lastName, company, position, domain },
        create: {
          email: lower,
          firstName,
          lastName,
          company,
          position,
          domain,
          source: "mcp",
          userId,
        },
      });
      if (!existing) void fireWebhooks(userId, "LEAD_CREATED", lead);
      return ok(lead);
    },
  );

  server.tool(
    "update_lead",
    "Update a lead's name, company or position.",
    {
      leadId: z.string(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      company: z.string().optional(),
      position: z.string().optional(),
    },
    async ({ leadId, ...fields }) => {
      const res = await prisma.lead.updateMany({
        where: { id: leadId, userId: await wsId() },
        data: fields,
      });
      return res.count ? ok({ updated: true }) : fail("Lead not found");
    },
  );

  server.tool(
    "delete_lead",
    "Delete a lead permanently.",
    { leadId: z.string() },
    async ({ leadId }) => {
      const res = await prisma.lead.deleteMany({
        where: { id: leadId, userId: await wsId() },
      });
      return res.count ? ok({ deleted: true }) : fail("Lead not found");
    },
  );

  // =========================================================================
  // 3. Campaigns
  // =========================================================================

  server.tool(
    "list_campaigns",
    "List all cold-email campaigns with their status and counts.",
    {},
    async () => {
      const campaigns = await prisma.campaign.findMany({
        where: { userId: await wsId() },
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { recipients: true, steps: true } } },
      });
      return ok({ count: campaigns.length, campaigns });
    },
  );

  server.tool(
    "get_campaign",
    "Get a campaign's steps, recipients and engagement stats (incl. A/B).",
    { campaignId: z.string() },
    async ({ campaignId }) => {
      const userId = await wsId();
      const campaign = await prisma.campaign.findFirst({
        where: { id: campaignId, userId },
        include: {
          steps: { orderBy: { order: "asc" } },
          emailAccount: { omit: { smtpPassword: true, imapPassword: true } },
          recipients: { include: { lead: true } },
        },
      });
      if (!campaign) return fail("Campaign not found");
      const grouped = await prisma.emailEvent.groupBy({
        by: ["type"],
        where: { recipient: { campaignId } },
        _count: { _all: true },
      });
      const stats = { SENT: 0, OPENED: 0, CLICKED: 0, REPLIED: 0, BOUNCED: 0 };
      for (const g of grouped) stats[g.type] = g._count._all;
      return ok({ campaign, stats });
    },
  );

  server.tool(
    "create_campaign",
    "Create a new campaign (starts as a draft with one editable step).",
    { name: z.string() },
    async ({ name }) => {
      const campaign = await prisma.campaign.create({
        data: {
          name,
          userId: await wsId(),
          steps: {
            create: {
              order: 0,
              delayHours: 0,
              subject: "Hi {{firstName}}",
              body: "Hi {{firstName}},\n\nWrite your message here.\n\nBest,",
            },
          },
        },
      });
      return ok(campaign);
    },
  );

  server.tool(
    "update_campaign",
    "Update a campaign: rename, set the sending mailbox, change status (DRAFT/ACTIVE/PAUSED/COMPLETED), or replace the drip sequence steps. Activating releases pending recipients for sending.",
    {
      campaignId: z.string(),
      name: z.string().optional(),
      mailboxId: z.string().nullable().optional(),
      status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "COMPLETED"]).optional(),
      steps: z
        .array(
          z.object({
            order: z.number().int().min(0),
            delayHours: z.number().int().min(0),
            subject: z.string(),
            body: z.string(),
            subjectB: z.string().nullable().optional(),
            bodyB: z.string().nullable().optional(),
          }),
        )
        .optional(),
    },
    async ({ campaignId, name, mailboxId, status, steps }) => {
      const userId = await wsId();
      const campaign = await prisma.campaign.findFirst({
        where: { id: campaignId, userId },
      });
      if (!campaign) return fail("Campaign not found");

      await prisma.$transaction(async (tx) => {
        if (name !== undefined || mailboxId !== undefined || status) {
          await tx.campaign.update({
            where: { id: campaignId },
            data: {
              ...(name !== undefined && { name }),
              ...(mailboxId !== undefined && { emailAccountId: mailboxId }),
              ...(status && { status }),
            },
          });
        }
        if (steps) {
          await tx.campaignStep.deleteMany({ where: { campaignId } });
          await tx.campaignStep.createMany({
            data: steps.map((s) => ({ ...s, campaignId })),
          });
        }
        if (status === "ACTIVE") {
          await tx.campaignRecipient.updateMany({
            where: { campaignId, status: "PENDING" },
            data: { status: "ACTIVE", nextSendAt: new Date() },
          });
        }
      });
      return ok({ updated: true });
    },
  );

  server.tool(
    "add_campaign_recipients",
    "Enroll leads as recipients of a campaign.",
    { campaignId: z.string(), leadIds: z.array(z.string()).min(1) },
    async ({ campaignId, leadIds }) => {
      const userId = await wsId();
      const campaign = await prisma.campaign.findFirst({
        where: { id: campaignId, userId },
      });
      if (!campaign) return fail("Campaign not found");
      const leads = await prisma.lead.findMany({
        where: { id: { in: leadIds }, userId },
        select: { id: true },
      });
      const res = await prisma.campaignRecipient.createMany({
        data: leads.map((l) => ({ campaignId, leadId: l.id })),
        skipDuplicates: true,
      });
      return ok({ added: res.count });
    },
  );

  // =========================================================================
  // 4. CRM
  // =========================================================================

  server.tool(
    "list_pipelines",
    "List CRM pipelines with their stages and deal counts.",
    {},
    async () => {
      const pipelines = await prisma.pipeline.findMany({
        where: { userId: await wsId() },
        orderBy: { createdAt: "asc" },
        include: {
          stages: { orderBy: { order: "asc" } },
          _count: { select: { deals: true } },
        },
      });
      return ok({ count: pipelines.length, pipelines });
    },
  );

  server.tool(
    "get_pipeline",
    "Get a pipeline's full board: stages, each with their deals.",
    { pipelineId: z.string() },
    async ({ pipelineId }) => {
      const pipeline = await prisma.pipeline.findFirst({
        where: { id: pipelineId, userId: await wsId() },
        include: {
          stages: {
            orderBy: { order: "asc" },
            include: { deals: { include: { lead: true } } },
          },
        },
      });
      return pipeline ? ok(pipeline) : fail("Pipeline not found");
    },
  );

  server.tool(
    "create_pipeline",
    "Create a CRM pipeline (auto-creates 5 default stages).",
    { name: z.string() },
    async ({ name }) => {
      const stages = ["Lead In", "Contacted", "Proposal", "Won", "Lost"];
      const pipeline = await prisma.pipeline.create({
        data: {
          name,
          userId: await wsId(),
          stages: { create: stages.map((n, order) => ({ name: n, order })) },
        },
        include: { stages: { orderBy: { order: "asc" } } },
      });
      return ok(pipeline);
    },
  );

  server.tool(
    "get_deal",
    "Get a deal's detail including its tasks and activity timeline.",
    { dealId: z.string() },
    async ({ dealId }) => {
      const deal = await prisma.deal.findFirst({
        where: { id: dealId, pipeline: { userId: await wsId() } },
        include: {
          lead: true,
          stage: true,
          pipeline: { include: { stages: { orderBy: { order: "asc" } } } },
          tasks: { orderBy: [{ done: "asc" }, { dueAt: "asc" }] },
          activities: { orderBy: { createdAt: "desc" } },
        },
      });
      return deal ? ok(deal) : fail("Deal not found");
    },
  );

  server.tool(
    "create_deal",
    "Create a deal in a pipeline. If stageId is omitted it lands in the first stage.",
    {
      title: z.string(),
      pipelineId: z.string(),
      stageId: z.string().optional(),
      value: z.number().min(0).optional(),
      leadId: z.string().optional(),
    },
    async ({ title, pipelineId, stageId, value, leadId }) => {
      const pipeline = await prisma.pipeline.findFirst({
        where: { id: pipelineId, userId: await wsId() },
        include: { stages: { orderBy: { order: "asc" } } },
      });
      if (!pipeline) return fail("Pipeline not found");
      const stage = stageId
        ? pipeline.stages.find((s) => s.id === stageId)
        : pipeline.stages[0];
      if (!stage) return fail("Stage not found");
      const deal = await prisma.deal.create({
        data: {
          title,
          value: value ?? 0,
          pipelineId,
          stageId: stage.id,
          leadId: leadId ?? null,
        },
      });
      return ok(deal);
    },
  );

  server.tool(
    "update_deal",
    "Update a deal: rename, change value, move to another stage, or link a lead.",
    {
      dealId: z.string(),
      title: z.string().optional(),
      value: z.number().min(0).optional(),
      stageId: z.string().optional(),
      leadId: z.string().nullable().optional(),
    },
    async ({ dealId, title, value, stageId, leadId }) => {
      const userId = await wsId();
      const deal = await prisma.deal.findFirst({
        where: { id: dealId, pipeline: { userId } },
        include: { stage: true },
      });
      if (!deal) return fail("Deal not found");
      if (stageId && stageId !== deal.stageId) {
        const stage = await prisma.stage.findFirst({
          where: { id: stageId, pipelineId: deal.pipelineId },
        });
        if (!stage) return fail("Stage not in this pipeline");
      }
      await prisma.deal.update({
        where: { id: dealId },
        data: {
          ...(title !== undefined && { title }),
          ...(value !== undefined && { value }),
          ...(stageId !== undefined && { stageId }),
          ...(leadId !== undefined && { leadId }),
        },
      });
      if (stageId && stageId !== deal.stageId) {
        const to = await prisma.stage.findUnique({ where: { id: stageId } });
        await prisma.activity.create({
          data: {
            type: "STAGE_CHANGE",
            content: `Moved from "${deal.stage.name}" to "${to?.name ?? "?"}"`,
            dealId,
            userId,
          },
        });
      }
      return ok({ updated: true });
    },
  );

  server.tool(
    "create_task",
    "Create a task, optionally attached to a deal or a lead.",
    {
      title: z.string(),
      dealId: z.string().optional(),
      leadId: z.string().optional(),
      dueAt: z.string().datetime().optional().describe("ISO 8601 datetime"),
    },
    async ({ title, dealId, leadId, dueAt }) => {
      const task = await prisma.task.create({
        data: {
          title,
          dealId: dealId ?? null,
          leadId: leadId ?? null,
          dueAt: dueAt ? new Date(dueAt) : null,
          userId: await wsId(),
        },
      });
      return ok(task);
    },
  );

  server.tool(
    "update_task",
    "Update a task — mark done/undone, rename, or change the due date.",
    {
      taskId: z.string(),
      done: z.boolean().optional(),
      title: z.string().optional(),
      dueAt: z.string().datetime().nullable().optional(),
    },
    async ({ taskId, done, title, dueAt }) => {
      const res = await prisma.task.updateMany({
        where: { id: taskId, userId: await wsId() },
        data: {
          ...(done !== undefined && { done }),
          ...(title !== undefined && { title }),
          ...(dueAt !== undefined && { dueAt: dueAt ? new Date(dueAt) : null }),
        },
      });
      return res.count ? ok({ updated: true }) : fail("Task not found");
    },
  );

  server.tool(
    "list_tasks",
    "List tasks, optionally scoped to a deal or lead, optionally open-only.",
    {
      dealId: z.string().optional(),
      leadId: z.string().optional(),
      openOnly: z.boolean().optional(),
    },
    async ({ dealId, leadId, openOnly }) => {
      const tasks = await prisma.task.findMany({
        where: {
          userId: await wsId(),
          ...(dealId && { dealId }),
          ...(leadId && { leadId }),
          ...(openOnly && { done: false }),
        },
        orderBy: [{ done: "asc" }, { dueAt: "asc" }],
        take: 200,
      });
      return ok({ count: tasks.length, tasks });
    },
  );

  server.tool(
    "log_activity",
    "Log an activity (note / call / email / meeting) on a deal or lead.",
    {
      type: z.enum(["NOTE", "CALL", "EMAIL", "MEETING"]),
      content: z.string(),
      dealId: z.string().optional(),
      leadId: z.string().optional(),
    },
    async ({ type, content, dealId, leadId }) => {
      if (!dealId && !leadId) return fail("Provide a dealId or leadId");
      const activity = await prisma.activity.create({
        data: {
          type,
          content,
          dealId: dealId ?? null,
          leadId: leadId ?? null,
          userId: await wsId(),
        },
      });
      return ok(activity);
    },
  );

  // =========================================================================
  // 5. Sending infrastructure
  // =========================================================================

  server.tool(
    "list_mailboxes",
    "List connected sending mailboxes (use their id when assigning a campaign).",
    {},
    async () => {
      const mailboxes = await prisma.emailAccount.findMany({
        where: { userId: await wsId() },
        omit: { smtpPassword: true, imapPassword: true },
        orderBy: { createdAt: "desc" },
      });
      return ok({ count: mailboxes.length, mailboxes });
    },
  );

  server.tool(
    "get_warmup_status",
    "Get warm-up status and counters for every mailbox.",
    {},
    async () => {
      const accounts = await prisma.emailAccount.findMany({
        where: { userId: await wsId() },
        omit: { smtpPassword: true, imapPassword: true },
      });
      const today = startOfToday();
      const rows = await Promise.all(
        accounts.map(async (a) => ({
          id: a.id,
          fromEmail: a.fromEmail,
          warmupOn: a.warmupOn,
          warmupTarget: a.warmupTarget,
          quotaToday: rampQuota(a),
          sentToday: await prisma.warmupEvent.count({
            where: { accountId: a.id, type: "SENT", createdAt: { gte: today } },
          }),
          totalSent: await prisma.warmupEvent.count({
            where: { accountId: a.id, type: "SENT" },
          }),
        })),
      );
      return ok({ accounts: rows });
    },
  );

  server.tool(
    "set_warmup",
    "Turn warm-up on or off for a mailbox.",
    { mailboxId: z.string(), enabled: z.boolean() },
    async ({ mailboxId, enabled }) => {
      const account = await prisma.emailAccount.findFirst({
        where: { id: mailboxId, userId: await wsId() },
      });
      if (!account) return fail("Mailbox not found");
      await prisma.emailAccount.update({
        where: { id: mailboxId },
        data: {
          warmupOn: enabled,
          ...(enabled && !account.warmupStartedAt
            ? { warmupStartedAt: new Date() }
            : {}),
        },
      });
      return ok({ warmupOn: enabled });
    },
  );

  server.tool(
    "run_deliverability_test",
    "Check a domain's email authentication (SPF/DKIM/DMARC/MX) and optionally scan a draft for spam signals.",
    {
      domain: z.string(),
      subject: z.string().optional(),
      body: z.string().optional(),
    },
    async ({ domain, subject, body }) => {
      const result = await runDeliverabilityTest({
        domain: domain.trim().toLowerCase().replace(/^@/, ""),
        subject,
        body,
      });
      return ok(result);
    },
  );

  // =========================================================================
  // 6. Bulk jobs
  // =========================================================================

  server.tool(
    "start_bulk_job",
    "Start a background bulk verification or finder job. For 'verify' pass `emails`; for 'find' pass `rows`.",
    {
      type: z.enum(["verify", "find"]),
      emails: z.array(z.string()).optional(),
      rows: z
        .array(
          z.object({
            firstName: z.string(),
            lastName: z.string().optional(),
            domain: z.string(),
          }),
        )
        .optional(),
    },
    async ({ type, emails, rows }) => {
      const isVerify = type === "verify";
      const input = isVerify ? emails : rows;
      if (!input || input.length === 0) {
        return fail(
          isVerify ? "Provide `emails`" : "Provide `rows`",
        );
      }
      const job = await prisma.bulkJob.create({
        data: {
          userId: await wsId(),
          type: isVerify ? "VERIFY" : "FIND",
          status: "QUEUED",
          total: input.length,
          input: input as Prisma.InputJsonValue,
        },
      });
      await bulkQueue.add(job.type, {
        kind: isVerify ? "verify" : "find",
        bulkJobId: job.id,
      });
      return ok({ jobId: job.id, status: job.status, total: job.total });
    },
  );

  server.tool(
    "get_bulk_job",
    "Get a bulk job's progress and results.",
    { jobId: z.string() },
    async ({ jobId }) => {
      const job = await prisma.bulkJob.findFirst({
        where: { id: jobId, userId: await wsId() },
        include: { verifications: true },
      });
      return job ? ok(job) : fail("Job not found");
    },
  );
}
