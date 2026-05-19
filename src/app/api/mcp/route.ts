import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { registerMcpTools } from "@/lib/mcp-tools";
import { authenticateApiKeyValue } from "@/lib/apikey";

export const runtime = "nodejs";
export const maxDuration = 60;

// The MCP server — exposes all 28 mailchecking tools.
// basePath tells mcp-handler this route is mounted at /api (endpoint /api/mcp).
const baseHandler = createMcpHandler(
  (server) => {
    registerMcpTools(server);
  },
  {},
  { basePath: "/api" },
);

// Gate every MCP request behind a workspace API key (Bearer token).
const handler = withMcpAuth(
  baseHandler,
  async (_req, token) => {
    if (!token) return undefined;
    const auth = await authenticateApiKeyValue(token);
    if (!auth.ok) return undefined;
    return {
      token,
      scopes: [],
      clientId: auth.userId ?? "workspace",
    };
  },
  { required: true },
);

export { handler as GET, handler as POST, handler as DELETE };
