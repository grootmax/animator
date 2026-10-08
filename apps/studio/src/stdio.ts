import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

export async function startStdioServer(mcpServer: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  console.error("Animator MCP Studio Server running on STDIO transport");
}
