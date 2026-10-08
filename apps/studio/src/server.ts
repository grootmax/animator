import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProjectStore } from "./store.js";
import { registerTools } from "./tools/index.js";

export function createStudioServer(store = new ProjectStore()): {
  server: McpServer;
  store: ProjectStore;
} {
  const server = new McpServer({
    name: "@animator/studio",
    version: "0.0.0",
  });

  registerTools(server, store);

  return { server, store };
}
