// Smoke-test the MCP server.  Usage: tsx scripts/mcp-test.ts <api-key>
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

async function main() {
  const key = process.argv[2];
  if (!key) {
    console.error("Usage: tsx scripts/mcp-test.ts <api-key>");
    process.exit(1);
  }

  const transport = new StreamableHTTPClientTransport(
    new URL("http://localhost:3000/api/mcp"),
    { requestInit: { headers: { Authorization: `Bearer ${key}` } } },
  );
  const client = new Client({ name: "mcp-smoke-test", version: "1.0.0" });
  await client.connect(transport);
  console.log("connected ✓");

  const { tools } = await client.listTools();
  console.log(`tools exposed: ${tools.length}`);
  console.log("  " + tools.map((t) => t.name).join(", "));

  const text = (r: { content: { type: string; text?: string }[] }) =>
    r.content.map((c) => c.text ?? "").join("");

  const verify = await client.callTool({
    name: "verify_email",
    arguments: { email: "support@github.com" },
  });
  const v = JSON.parse(text(verify as never));
  console.log(`verify_email -> ${v.status} (score ${v.score})`);

  const find = await client.callTool({
    name: "find_email",
    arguments: { firstName: "Test", lastName: "User", domain: "github.com" },
  });
  const f = JSON.parse(text(find as never));
  console.log(`find_email -> ${f.best ? f.best.email : "none"}`);

  const search = await client.callTool({
    name: "search_leads",
    arguments: { limit: 5 },
  });
  const s = JSON.parse(text(search as never));
  console.log(`search_leads -> ${s.count} leads visible`);

  const campaigns = await client.callTool({
    name: "list_campaigns",
    arguments: {},
  });
  const c = JSON.parse(text(campaigns as never));
  console.log(`list_campaigns -> ${c.count} campaigns`);

  await client.close();
  console.log("done ✓");
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
