import { z } from "zod";

export const verifySchema = z.object({
  email: z.string().min(3).max(254),
});

export const findSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).optional().default(""),
  domain: z.string().min(3).max(255),
});

export const bulkVerifySchema = z.object({
  type: z.literal("verify"),
  emails: z.array(z.string()).min(1).max(10000),
});

export const bulkFindSchema = z.object({
  type: z.literal("find"),
  rows: z
    .array(
      z.object({
        firstName: z.string().min(1),
        lastName: z.string().default(""),
        domain: z.string().min(3),
      }),
    )
    .min(1)
    .max(10000),
});

export const bulkSchema = z.discriminatedUnion("type", [
  bulkVerifySchema,
  bulkFindSchema,
]);

export const emailAccountSchema = z.object({
  fromName: z.string().min(1).max(100),
  fromEmail: z.string().email(),
  smtpHost: z.string().min(1).max(255),
  smtpPort: z.number().int().min(1).max(65535).default(587),
  smtpUser: z.string().min(1).max(255),
  smtpPassword: z.string().min(1).max(500),
  smtpSecure: z.boolean().default(false),
  dailyLimit: z.number().int().min(1).max(2000).default(50),
  // Optional IMAP settings — enables reply detection.
  imapHost: z.string().max(255).optional(),
  imapPort: z.number().int().min(1).max(65535).optional(),
  imapUser: z.string().max(255).optional(),
  imapPassword: z.string().max(500).optional(),
  imapSecure: z.boolean().optional(),
});

export const campaignStepSchema = z.object({
  order: z.number().int().min(0),
  delayHours: z.number().int().min(0).max(24 * 90),
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(50000),
  subjectB: z.string().max(300).nullable().optional(),
  bodyB: z.string().max(50000).nullable().optional(),
});

export const createCampaignSchema = z.object({
  name: z.string().min(1).max(150),
});

export const updateCampaignSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  emailAccountId: z.string().nullable().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "COMPLETED"]).optional(),
  steps: z.array(campaignStepSchema).optional(),
});

export const addRecipientsSchema = z.object({
  leadIds: z.array(z.string()).min(1).max(5000),
});

export const signupSchema = z.object({
  email: z.string().email().max(254).transform((s) => s.trim().toLowerCase()),
  password: z.string().min(8).max(200),
  name: z.string().max(100).optional(),
  inviteCode: z.string().max(100).optional(),
});

export const loginSchema = z.object({
  email: z.string().email().max(254).transform((s) => s.trim().toLowerCase()),
  password: z.string().min(1).max(200),
});

export const deliverabilitySchema = z.object({
  domain: z
    .string()
    .min(3)
    .max(255)
    .transform((s) => s.trim().toLowerCase().replace(/^@/, "")),
  subject: z.string().max(300).optional(),
  body: z.string().max(50000).optional(),
});

// --- CRM ---------------------------------------------------------------

export const stageSchema = z.object({
  name: z.string().min(1).max(60),
  order: z.number().int().min(0),
});

export const createPipelineSchema = z.object({
  name: z.string().min(1).max(100),
});

export const updatePipelineSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  stages: z.array(stageSchema).min(1).max(20).optional(),
});

export const createDealSchema = z.object({
  title: z.string().min(1).max(150),
  value: z.number().min(0).max(1e12).default(0),
  pipelineId: z.string().min(1),
  stageId: z.string().min(1),
  leadId: z.string().optional(),
});

export const updateDealSchema = z.object({
  title: z.string().min(1).max(150).optional(),
  value: z.number().min(0).max(1e12).optional(),
  stageId: z.string().min(1).optional(),
  leadId: z.string().nullable().optional(),
});

export const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  dueAt: z.string().datetime().nullable().optional(),
  dealId: z.string().optional(),
  leadId: z.string().optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  done: z.boolean().optional(),
  dueAt: z.string().datetime().nullable().optional(),
});

export const createActivitySchema = z.object({
  type: z.enum(["NOTE", "CALL", "EMAIL", "MEETING"]).default("NOTE"),
  content: z.string().min(1).max(5000),
  dealId: z.string().optional(),
  leadId: z.string().optional(),
});

export const createLeadSchema = z.object({
  email: z.string().email(),
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  position: z.string().max(150).optional(),
  company: z.string().max(150).optional(),
  listId: z.string().optional(),
  source: z.string().max(40).optional(),
});
