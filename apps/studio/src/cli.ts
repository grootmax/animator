#!/usr/bin/env node

import { startHttpServer } from "./http.js";
import { createStudioServer } from "./server.js";
import { startStdioServer } from "./stdio.js";

async function main() {
  const args = process.argv.slice(2);
  let transportMode = "stdio";
  let port = 4747;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--transport" && args[i + 1]) {
      const nextArg = args[i + 1];
      if (nextArg) {
        transportMode = nextArg;
      }
      i++;
    } else if (arg === "--port" && args[i + 1]) {
      const nextArg = args[i + 1];
      if (nextArg) {
        port = Number.parseInt(nextArg, 10) || 4747;
      }
      i++;
    } else if (arg === "http") {
      transportMode = "http";
    } else if (arg === "stdio") {
      transportMode = "stdio";
    }
  }

  const { server } = createStudioServer();

  if (transportMode === "http") {
    await startHttpServer(server, port);
  } else {
    await startStdioServer(server);
  }
}

main().catch((err) => {
  console.error("Fatal error starting Animator Studio Server:", err);
  process.exit(1);
});
