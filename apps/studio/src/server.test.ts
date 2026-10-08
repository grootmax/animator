import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { startHttpServer } from "./http.js";
import { createStudioServer } from "./server.js";

type TextContent = { type: "text"; text: string };
type ImageContent = { type: "image"; data: string; mimeType: string };

describe("Animator MCP Studio Server Integration", () => {
  let client: Client;

  beforeEach(async () => {
    const { server } = createStudioServer();
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    client = new Client(
      {
        name: "test-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );

    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
  });

  test("discovers all registered MCP studio tools via handshake", async () => {
    const response = await client.listTools();
    const toolNames = response.tools.map((t) => t.name);

    expect(toolNames).toContain("create_project");
    expect(toolNames).toContain("get_project");
    expect(toolNames).toContain("list_projects");
    expect(toolNames).toContain("edit_project");
    expect(toolNames).toContain("validate_project");
    expect(toolNames).toContain("render_preview");
  });

  test("executes project creation, mutation via applyOps, and frame rendering preview", async () => {
    // 1. Create project
    const createRes = await client.callTool({
      name: "create_project",
      arguments: {
        name: "Test Launch Banner",
        width: 1080,
        height: 1080,
        fps: 30,
        duration: 4,
      },
    });

    expect(createRes.isError).toBeFalsy();
    const createContent = createRes.content as TextContent[];
    const createText = createContent[0]?.text || "";
    const createJson = JSON.parse(createText);
    expect(createJson.message).toBe("Project created successfully");
    const projectId = createJson.projectId;
    expect(projectId).toBeTruthy();

    // 2. Edit project via applyOps
    const editRes = await client.callTool({
      name: "edit_project",
      arguments: {
        projectId,
        ops: [
          {
            op: "addLayer",
            layer: {
              id: "hero-title",
              type: "text",
              text: "Launch Soon",
              position: [540, 480],
            },
          },
        ],
      },
    });

    expect(editRes.isError).toBeFalsy();
    const editContent = editRes.content as TextContent[];
    const editText = editContent[0]?.text || "";
    const editJson = JSON.parse(editText);
    expect(editJson.revision).toBe(1);
    expect(editJson.changedIds).toEqual(["hero-title"]);

    // 3. Get project
    const getRes = await client.callTool({
      name: "get_project",
      arguments: {
        projectId,
        detail: "full",
      },
    });

    const getContent = getRes.content as TextContent[];
    const getDoc = JSON.parse(getContent[0]?.text || "{}");
    expect(getDoc.layers).toHaveLength(1);
    expect(getDoc.layers[0]?.id).toBe("hero-title");

    // 4. Validate project
    const valRes = await client.callTool({
      name: "validate_project",
      arguments: { projectId },
    });

    const valContent = valRes.content as TextContent[];
    const valJson = JSON.parse(valContent[0]?.text || "{}");
    expect(valJson.valid).toBe(true);

    // 5. Render preview
    const previewRes = await client.callTool({
      name: "render_preview",
      arguments: {
        projectId,
        count: 3,
        size: 256,
      },
    });

    expect(previewRes.isError).toBeFalsy();
    const previewContent = previewRes.content as Array<
      TextContent | ImageContent
    >;
    const previewMeta = JSON.parse((previewContent[0] as TextContent).text);
    expect(previewMeta.frameCount).toBe(3);
    expect(previewContent.length).toBeGreaterThan(1);
    expect(previewContent[1]?.type).toBe("image");
  });

  test("starts HTTP transport server successfully", async () => {
    const { server } = createStudioServer();
    const httpServer = await startHttpServer(server, 0);
    expect(httpServer.listening).toBe(true);

    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  });
});
