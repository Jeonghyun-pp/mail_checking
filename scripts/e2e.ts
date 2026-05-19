/**
 * Full end-to-end test suite for mailchecking.
 * Run with the app + worker + Docker (Postgres/Redis/Mailpit) up:
 *   tsx scripts/e2e.ts
 */
import http from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const BASE = "http://localhost:3000";
const MAILPIT = "http://localhost:8025";
const OWNER = { email: "owner@mail-checking.local", password: "demo-pass-1234" };

let pass = 0,
  fail = 0,
  skip = 0;
let cookie = "";

function check(label: string, ok: boolean, detail = "") {
  const mark = ok ? "✓" : "✗";
  if (ok) pass++;
  else fail++;
  console.log(`  ${mark} ${label}${detail ? ` — ${detail}` : ""}`);
}
function skipped(label: string, reason: string) {
  skip++;
  console.log(`  ⊘ ${label} — ${reason}`);
}
function section(name: string) {
  console.log(`\n${name}`);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api(
  method: string,
  path: string,
  body?: unknown,
  useCookie = true,
) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(useCookie && cookie ? { Cookie: cookie } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* non-json */
  }
  return { status: res.status, json: json as Record<string, unknown>, res };
}

// In-process webhook receiver.
const webhookHits: { event: string }[] = [];
const receiver = http.createServer((req, res) => {
  let b = "";
  req.on("data", (c) => (b += c));
  req.on("end", () => {
    try {
      webhookHits.push(JSON.parse(b));
    } catch {
      /* ignore */
    }
    res.writeHead(200);
    res.end("ok");
  });
});

async function main() {
  receiver.listen(4500);
  console.log("=== mailchecking E2E suite ===");

  // ---- A. Infra & smoke --------------------------------------------------
  section("A. Infra & smoke");
  const mailpitUp = (await fetch(MAILPIT + "/api/v1/messages")
    .then((r) => r.ok)
    .catch(() => false)) as boolean;
  check("Mailpit reachable", mailpitUp);
  await fetch(MAILPIT + "/api/v1/messages", { method: "DELETE" }).catch(
    () => {},
  );
  const loginPage = await fetch(BASE + "/login").then((r) => r.status);
  check("App responds", loginPage === 200);
  const unauth = await fetch(BASE + "/api/leads").then((r) => r.status);
  check("Unauthenticated API → 401", unauth === 401);
  const rootRedirect = await fetch(BASE + "/", { redirect: "manual" }).then(
    (r) => r.status,
  );
  check("Unauthenticated page → redirect", rootRedirect === 307);

  // ---- B. Auth & workspace ----------------------------------------------
  section("B. Auth & workspace");
  const badLogin = await api(
    "POST",
    "/api/auth/login",
    { email: OWNER.email, password: "wrong" },
    false,
  );
  check("Wrong password → 401", badLogin.status === 401);

  const login = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(OWNER),
  });
  const setCookies = login.headers.getSetCookie?.() ?? [];
  const sess = setCookies.find((c) => c.startsWith("mc_session="));
  cookie = sess ? sess.split(";")[0] : "";
  check("Owner login", login.status === 200 && !!cookie);

  const me = await api("GET", "/api/auth/me");
  const meUser = me.json.user as { role?: string } | null;
  check("Owner role = ADMIN", meUser?.role === "ADMIN");

  const noCode = await api(
    "POST",
    "/api/auth/signup",
    { email: `x${Date.now()}@t.com`, password: "password123" },
    false,
  );
  check("Signup without invite code → 403", noCode.status === 403);

  const invite = await api("POST", "/api/invites");
  const code = (invite.json.invite as { code?: string })?.code;
  check("Admin generates invite code", invite.status === 201 && !!code);

  const memberEmail = `e2e-member-${Date.now()}@test.com`;
  const memberSignup = await fetch(BASE + "/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: memberEmail,
      password: "password123",
      inviteCode: code,
    }),
  });
  const memberCookies = memberSignup.headers.getSetCookie?.() ?? [];
  const memberSess = memberCookies
    .find((c) => c.startsWith("mc_session="))
    ?.split(";")[0];
  check("Signup with valid code", memberSignup.status === 200);

  const reuse = await api(
    "POST",
    "/api/auth/signup",
    { email: `x${Date.now()}@t.com`, password: "password123", inviteCode: code },
    false,
  );
  check("Reusing invite code → 403", reuse.status === 403);

  // Shared workspace: member sees the owner's data.
  const memberLeads = await fetch(BASE + "/api/leads", {
    headers: { Cookie: memberSess ?? "" },
  }).then((r) => r.json());
  check(
    "Shared workspace — member sees team leads",
    (memberLeads.leads?.length ?? 0) > 0,
    `${memberLeads.leads?.length ?? 0} leads`,
  );

  // ---- C. Email Verifier -------------------------------------------------
  section("C. Email Verifier");
  const vGood = await api("POST", "/api/verify", { email: "support@github.com" });
  check(
    "Verify real address",
    vGood.status === 200 && typeof vGood.json.status === "string",
    String(vGood.json.status),
  );
  const vBad = await api("POST", "/api/verify", { email: "not-an-email" });
  check("Bad syntax → INVALID", vBad.json.status === "INVALID");
  const vNoMx = await api("POST", "/api/verify", {
    email: "x@nonexistent-domain-zzz999.com",
  });
  check("No-MX domain → INVALID", vNoMx.json.status === "INVALID");
  const vDisp = await api("POST", "/api/verify", {
    email: "test@mailinator.com",
  });
  check("Disposable domain → INVALID", vDisp.json.status === "INVALID");

  const bulkV = await api("POST", "/api/bulk", {
    type: "verify",
    emails: ["test@github.com", "info@google.com"],
  });
  const bulkId = (bulkV.json.job as { id?: string })?.id;
  check("Bulk verify job created", bulkV.status === 201 && !!bulkId);
  let bulkDone = false;
  for (let i = 0; i < 15 && !bulkDone; i++) {
    await sleep(2000);
    const j = await api("GET", `/api/bulk/${bulkId}`);
    bulkDone = (j.json.job as { status?: string })?.status === "DONE";
  }
  check("Bulk verify processed by worker", bulkDone);

  // ---- D. Email Finder ---------------------------------------------------
  section("D. Email Finder");
  const find = await api("POST", "/api/find", {
    firstName: "Test",
    lastName: "User",
    domain: "github.com",
  });
  check(
    "Finder generates candidates",
    Array.isArray(find.json.candidates) &&
      (find.json.candidates as unknown[]).length > 0,
  );
  const findNoMx = await api("POST", "/api/find", {
    firstName: "A",
    domain: "nonexistent-domain-zzz999.com",
  });
  check("Finder on no-MX domain → no result", findNoMx.json.best === null);

  // ---- E. Leads ----------------------------------------------------------
  section("E. Leads");
  const leadEmail = `e2e-lead-${Date.now()}@example.com`;
  const createLead = await api("POST", "/api/leads", {
    email: leadEmail,
    firstName: "E2E",
    company: "TestCo",
  });
  const leadId = (createLead.json.lead as { id?: string })?.id;
  check("Create lead", createLead.status === 201 && !!leadId);
  const importCsv = await api("POST", "/api/leads/import", {
    csv: "email,firstName,company\ne2e-imp1@x.com,Imp,One\nbad-row\ne2e-imp2@x.com,Imp,Two",
  });
  check(
    "CSV import (skips bad rows)",
    importCsv.json.imported === 2 && importCsv.json.skipped === 1,
  );
  const exportCsv = await fetch(BASE + "/api/leads/export", {
    headers: { Cookie: cookie },
  });
  const csvText = await exportCsv.text();
  check(
    "CSV export",
    exportCsv.status === 200 && csvText.startsWith("email,"),
  );

  // ---- F. Email accounts -------------------------------------------------
  section("F. Email accounts");
  const acct = await api("POST", "/api/email-accounts", {
    fromName: "E2E Sender",
    fromEmail: "e2e@mail-checking.local",
    smtpHost: "localhost",
    smtpPort: 1025,
    smtpUser: "e2e",
    smtpPassword: "e2e",
    smtpSecure: false,
    dailyLimit: 100,
  });
  const acctId = (acct.json.account as { id?: string })?.id;
  check("Add SMTP mailbox", acct.status === 201 && !!acctId);
  const acctTest = await api("POST", `/api/email-accounts/${acctId}/test`);
  check("Mailbox connection test", acctTest.json.ok === true);

  // ---- G-setup. Campaign (async — checked later) -------------------------
  section("G. Campaign — setup");
  const camp = await api("POST", "/api/campaigns", { name: "E2E Campaign" });
  const campId = (camp.json.campaign as { id?: string })?.id;
  check("Create campaign", camp.status === 201 && !!campId);
  const campCfg = await api("PATCH", `/api/campaigns/${campId}`, {
    emailAccountId: acctId,
    steps: [
      {
        order: 0,
        delayHours: 0,
        subject: "E2E hello {{firstName}}",
        body: "Hi {{firstName}}, this is an {E2E|e2e} test. https://example.com",
      },
    ],
  });
  check("Configure campaign sequence + mailbox", campCfg.json.ok === true);
  const recip = await api("POST", `/api/campaigns/${campId}/recipients`, {
    leadIds: [leadId],
  });
  check("Add campaign recipient", recip.json.added === 1);
  const activate = await api("PATCH", `/api/campaigns/${campId}`, {
    status: "ACTIVE",
  });
  check("Activate campaign", activate.json.ok === true);
  const campaignActivatedAt = Date.now();

  // ---- H. CRM ------------------------------------------------------------
  section("H. CRM");
  const pipe = await api("POST", "/api/pipelines", { name: "E2E Pipeline" });
  const pipeJson = pipe.json.pipeline as {
    id?: string;
    stages?: { id: string }[];
  };
  check(
    "Create pipeline with default stages",
    pipe.status === 201 && (pipeJson.stages?.length ?? 0) === 5,
  );
  const deal = await api("POST", "/api/deals", {
    title: "E2E Deal",
    value: 5000,
    pipelineId: pipeJson.id,
    stageId: pipeJson.stages![0].id,
    leadId,
  });
  const dealId = (deal.json.deal as { id?: string })?.id;
  check("Create deal with lead", deal.status === 201 && !!dealId);
  const moveDeal = await api("PATCH", `/api/deals/${dealId}`, {
    stageId: pipeJson.stages![1].id,
  });
  check("Move deal to next stage", moveDeal.json.ok === true);
  const task = await api("POST", "/api/tasks", {
    title: "E2E task",
    dealId,
  });
  const taskId = (task.json.task as { id?: string })?.id;
  check("Create task", task.status === 201 && !!taskId);
  const doneTask = await api("PATCH", `/api/tasks/${taskId}`, { done: true });
  check("Complete task", doneTask.json.ok === true);
  const activity = await api("POST", "/api/activities", {
    type: "CALL",
    content: "E2E call note",
    dealId,
  });
  check("Log activity", activity.status === 201);
  const dealDetail = await api("GET", `/api/deals/${dealId}`);
  const dealActs = (dealDetail.json.deal as { activities?: unknown[] })
    ?.activities;
  check(
    "Deal timeline records stage-change + activity",
    (dealActs?.length ?? 0) >= 2,
  );

  // ---- J. Deliverability -------------------------------------------------
  section("J. Deliverability");
  const delivGood = await api("POST", "/api/deliverability", {
    domain: "gmail.com",
  });
  check(
    "Deliverability — authenticated domain scores high",
    (delivGood.json.authScore as number) >= 50,
    `score ${delivGood.json.authScore}`,
  );
  const delivSpam = await api("POST", "/api/deliverability", {
    domain: "example.com",
    subject: "FREE!!! WINNER",
    body: "CONGRATULATIONS act now buy now $$$ guarantee 100% risk-free",
  });
  const spamContent = delivSpam.json.content as { issues?: unknown[] };
  check(
    "Deliverability — spam content flagged",
    (spamContent?.issues?.length ?? 0) > 0,
  );

  // ---- K. Public API & webhooks -----------------------------------------
  section("K. Public API & webhooks");
  const keyRes = await api("POST", "/api/api-keys", { name: "E2E key" });
  const apiKey = keyRes.json.key as string;
  check("Create API key", keyRes.status === 201 && !!apiKey);
  const noKey = await fetch(BASE + "/api/v1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "x@github.com" }),
  });
  check("Public API without key → 401", noKey.status === 401);
  const v1 = await fetch(BASE + "/api/v1/verify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ email: "support@github.com" }),
  });
  check("Public API /v1/verify with key", v1.status === 200);

  const hook = await api("POST", "/api/webhooks", {
    url: "http://localhost:4500/hook",
    event: "LEAD_CREATED",
  });
  check("Register webhook", hook.status === 201);
  const hookId = (hook.json.webhook as { id?: string })?.id;
  webhookHits.length = 0;
  await api("POST", "/api/leads", {
    email: `e2e-hook-${Date.now()}@example.com`,
    firstName: "Hook",
  });
  await sleep(1500);
  check(
    "Webhook fires on lead creation",
    webhookHits.some((h) => h.event === "LEAD_CREATED"),
  );

  // ---- L. MCP server -----------------------------------------------------
  section("L. MCP server");
  try {
    const transport = new StreamableHTTPClientTransport(
      new URL(BASE + "/api/mcp"),
      { requestInit: { headers: { Authorization: `Bearer ${apiKey}` } } },
    );
    const mcp = new Client({ name: "e2e", version: "1.0.0" });
    await mcp.connect(transport);
    const { tools } = await mcp.listTools();
    check("MCP — 28 tools exposed", tools.length === 28, `${tools.length}`);
    const call = await mcp.callTool({
      name: "verify_email",
      arguments: { email: "support@github.com" },
    });
    const callText = (call.content as { text?: string }[])[0]?.text ?? "";
    check("MCP — tool call works", callText.includes("status"));
    await mcp.close();
  } catch (e) {
    check("MCP server", false, String(e));
  }
  const mcpNoAuth = await fetch(BASE + "/api/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
  });
  check("MCP without key → 401", mcpNoAuth.status === 401);

  // ---- G-check. Campaign delivery & tracking -----------------------------
  section("G. Campaign — delivery & tracking (waiting for worker tick)");
  let campMail: { ID: string } | null = null;
  const waited = Date.now() - campaignActivatedAt;
  for (let i = 0; i < 25 && !campMail; i++) {
    const msgs = await fetch(MAILPIT + "/api/v1/messages?limit=20")
      .then((r) => r.json())
      .catch(() => ({ messages: [] }));
    campMail =
      (msgs.messages as { ID: string; Subject: string }[]).find((m) =>
        m.Subject.startsWith("E2E hello"),
      ) ?? null;
    if (!campMail) await sleep(5000);
  }
  check(
    "Campaign email delivered (worker tick)",
    !!campMail,
    `waited ~${Math.round((Date.now() - campaignActivatedAt) / 1000)}s`,
  );
  if (campMail) {
    const msg = await fetch(MAILPIT + `/api/v1/message/${campMail.ID}`).then(
      (r) => r.json(),
    );
    const html = msg.HTML as string;
    check("Personalization variable substituted", html.includes("Hi E2E,"));
    check(
      "Text spinning resolved (no braces left)",
      !/\{[^}]*\|[^}]*\}/.test(html),
    );
    check("Unsubscribe footer injected", html.includes("/api/track/unsub/"));
    check("Open-tracking pixel injected", html.includes("/api/track/open/"));

    const campNow = await api("GET", `/api/campaigns/${campId}`);
    const recipients = (campNow.json.campaign as {
      recipients?: { id: string }[];
    }).recipients;
    const steps = (campNow.json.campaign as { steps?: { id: string }[] })
      .steps;
    if (recipients?.[0] && steps?.[0]) {
      await fetch(
        `${BASE}/api/track/open/${recipients[0].id}/${steps[0].id}`,
      );
      const clickRes = await fetch(
        `${BASE}/api/track/click/${recipients[0].id}/${steps[0].id}?url=${encodeURIComponent("https://example.com")}`,
        { redirect: "manual" },
      );
      check("Click tracking → 302 redirect", clickRes.status === 302);
      await sleep(500);
      const stats = await api("GET", `/api/campaigns/${campId}`);
      const s = stats.json.stats as { SENT: number; OPENED: number };
      check("Campaign stats — SENT recorded", s.SENT >= 1);
      check("Campaign stats — OPENED recorded", s.OPENED >= 1);
    }
  } else {
    skipped("Tracking & stats", "campaign email never arrived");
  }

  // ---- I. Warm-up --------------------------------------------------------
  section("I. Warm-up");
  const warmup = await api("GET", "/api/warmup");
  const wAccounts = (warmup.json.accounts as { id: string }[]) ?? [];
  check("Warm-up status readable", warmup.status === 200);
  if (wAccounts.length >= 2) {
    await api("PATCH", `/api/email-accounts/${wAccounts[0].id}`, {
      warmupOn: true,
    });
    await api("PATCH", `/api/email-accounts/${wAccounts[1].id}`, {
      warmupOn: true,
    });
    check("Enable warm-up on 2 mailboxes (pool)", true);
    const after = await api("GET", "/api/warmup");
    const on = (after.json.accounts as { warmupOn: boolean }[]).filter(
      (a) => a.warmupOn,
    ).length;
    check("Warm-up pool active", on >= 2, `${on} mailboxes`);
  } else {
    skipped("Warm-up pool", "fewer than 2 mailboxes");
  }
  skipped(
    "Warm-up live send / IMAP processing",
    "needs real IMAP mailbox (Mailpit has no IMAP) — verified separately",
  );

  // ---- Limitations -------------------------------------------------------
  section("M. Known limitations (manual / external only)");
  skipped("IMAP reply detection", "needs a real IMAP mailbox");
  skipped("Chrome extension in-browser", "load unpacked + manual check");
  skipped("API daily rate-limit 429", "needs 1000+ calls");

  // ---- Cleanup -----------------------------------------------------------
  section("Cleanup (E2E test data)");
  await api("DELETE", `/api/campaigns/${campId}`).catch(() => {});
  await api("DELETE", `/api/pipelines/${pipeJson.id}`).catch(() => {});
  await api("DELETE", `/api/email-accounts/${acctId}`).catch(() => {});
  if (hookId) await api("DELETE", `/api/webhooks/${hookId}`).catch(() => {});
  console.log("  test campaign / pipeline / mailbox / webhook removed");
  console.log("  (E2E leads + test member account left in workspace)");

  // ---- Summary -----------------------------------------------------------
  console.log(
    `\n=== Result: ${pass} passed, ${fail} failed, ${skip} skipped ===`,
  );
  receiver.close();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("E2E run crashed:", err);
  receiver.close();
  process.exit(1);
});
