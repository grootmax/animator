import http from "node:http";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

export function startHttpServer(
  mcpServer: McpServer,
  port = 4747,
): Promise<http.Server> {
  return new Promise((resolve) => {
    const transports = new Map<string, SSEServerTransport>();

    const httpServer = http.createServer(async (req, res) => {
      const url = new URL(
        req.url || "/",
        `http://${req.headers.host || "localhost"}`,
      );

      // Enable CORS
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      if (
        req.method === "GET" &&
        (url.pathname === "/sse" || url.pathname === "/mcp")
      ) {
        const transport = new SSEServerTransport("/messages", res);
        transports.set(transport.sessionId, transport);

        req.on("close", () => {
          transports.delete(transport.sessionId);
        });

        await mcpServer.connect(transport);
        return;
      }

      if (req.method === "POST" && url.pathname === "/messages") {
        const sessionId = url.searchParams.get("sessionId");
        if (!sessionId) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing sessionId parameter" }));
          return;
        }

        const transport = transports.get(sessionId);
        if (!transport) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Session not found" }));
          return;
        }

        await transport.handlePostMessage(req, res);
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    });

    httpServer.listen(port, () => {
      console.error(
        `Animator MCP Studio Server running on HTTP transport at http://localhost:${port}/sse`,
      );
      resolve(httpServer);
    });
  });
}
