import { LocalStorage } from "@raycast/api";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { MCPServer, ToolCall } from "./domain";
export type AvailableTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  server: MCPServer;
  originalName: string;
};
export async function getServers(): Promise<MCPServer[]> {
  const items = await LocalStorage.allItems();
  return Object.entries(items).flatMap(([k, raw]) => {
    if (!k.startsWith("relay-mcp:") || typeof raw !== "string") return [];
    try {
      const v = JSON.parse(raw) as MCPServer;
      const url = new URL(v.url);
      return v.id &&
        v.title &&
        !v.deletedAt &&
        ["https:", "http:"].includes(url.protocol) &&
        !url.username &&
        !url.password
        ? [v]
        : [];
    } catch {
      return [];
    }
  });
}
export async function saveServer(server: MCPServer) {
  const url = new URL(server.url);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error(
      "Use an HTTP(S) MCP endpoint without embedded credentials.",
    );
  await LocalStorage.setItem(
    "relay-mcp:" + server.id,
    JSON.stringify({ ...server, updatedAt: Date.now() }),
  );
}
async function withClient<T>(
  server: MCPServer,
  signal: AbortSignal | undefined,
  job: (client: Client) => Promise<T>,
): Promise<T> {
  signal?.throwIfAborted();
  const token = server.keyEnv ? process.env[server.keyEnv] : undefined;
  const client = new Client({ name: "relay-ai", version: "2.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(server.url), {
    requestInit: token
      ? { headers: { Authorization: `Bearer ${token}` } }
      : undefined,
  });
  const stop = () => {
    void client.close();
  };
  signal?.addEventListener("abort", stop, { once: true });
  try {
    await client.connect(transport, { timeout: 15000 });
    signal?.throwIfAborted();
    return await job(client);
  } finally {
    signal?.removeEventListener("abort", stop);
    await client.close().catch(() => undefined);
  }
}
export async function discoverTools(
  signal?: AbortSignal,
): Promise<AvailableTool[]> {
  const results = await Promise.all(
    (await getServers()).map((server) =>
      withClient(server, signal, async (client) => {
        const tools: AvailableTool[] = [];
        let cursor: string | undefined;
        do {
          const page = await client.listTools(cursor ? { cursor } : undefined, {
            timeout: 15000,
          });
          for (const t of page.tools)
            tools.push({
              name: `mcp_${server.id.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 12)}_${t.name.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 44)}`,
              description: `${server.title}: ${t.description || t.name}`,
              parameters: t.inputSchema,
              server,
              originalName: t.name,
            });
          cursor = page.nextCursor;
        } while (cursor && tools.length < 100);
        return tools;
      }),
    ),
  );
  const tools = results.flat();
  if (new Set(tools.map((t) => t.name)).size !== tools.length)
    throw new Error(
      "MCP tool names collide. Rename one of the configured tools.",
    );
  return tools.slice(0, 100);
}
export async function runTool(
  call: ToolCall,
  tools: AvailableTool[],
  signal?: AbortSignal,
) {
  const tool = tools.find((t) => t.name === call.name);
  if (!tool) throw new Error("The requested tool is not available.");
  let args: unknown;
  try {
    args = JSON.parse(call.arguments || "{}");
  } catch {
    throw new Error("The model returned invalid tool arguments.");
  }
  if (!args || typeof args !== "object" || Array.isArray(args))
    throw new Error("Tool arguments must be a JSON object.");
  return withClient(tool.server, signal, async (client) => {
    const result = await client.callTool(
      { name: tool.originalName, arguments: args as Record<string, unknown> },
      undefined,
      { timeout: 60000, signal },
    );
    const text = JSON.stringify(result);
    return text.length > 50000
      ? text.slice(0, 50000) + "\n[Tool result truncated to 50 KB]"
      : text;
  });
}
