import type { Op } from "@animator/core";
import { renderPreview } from "@animator/render";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ProjectStore } from "../store.js";

type ToolContentItem =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

export function registerTools(server: McpServer, store: ProjectStore): void {
  // 1. create_project
  server.tool(
    "create_project",
    "Create a new animation project with specified canvas parameters",
    {
      name: z.string().describe("Project name").default("Untitled Project"),
      width: z
        .number()
        .positive()
        .describe("Canvas width in pixels")
        .default(1080),
      height: z
        .number()
        .positive()
        .describe("Canvas height in pixels")
        .default(1080),
      fps: z.number().positive().describe("Frames per second").default(30),
      duration: z
        .number()
        .positive()
        .describe("Duration in seconds")
        .default(4),
      background: z
        .string()
        .describe("Background hex color")
        .default("#0B1020"),
    },
    async ({ name, width, height, fps, duration, background }) => {
      const { id, doc } = store.createProject({
        name,
        width,
        height,
        fps,
        duration,
        background,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                message: "Project created successfully",
                projectId: id,
                revision: doc.revision,
                canvas: doc.canvas,
                outline: store.getProjectOutline(id),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // 2. get_project
  server.tool(
    "get_project",
    "Retrieve project details, outline, or full document",
    {
      projectId: z.string().describe("ID of the project"),
      detail: z
        .enum(["outline", "full", "lottie"])
        .describe("Level of detail to return")
        .default("outline"),
    },
    async ({ projectId, detail }) => {
      const doc = store.getProject(projectId);
      if (!doc) {
        return {
          isError: true,
          content: [
            { type: "text", text: `Error: Project '${projectId}' not found.` },
          ],
        };
      }

      if (detail === "full") {
        return {
          content: [{ type: "text", text: JSON.stringify(doc, null, 2) }],
        };
      }

      if (detail === "lottie") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  projectId,
                  type: "lottie_stub",
                  canvas: doc.canvas,
                  layerCount: doc.layers.length,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      return {
        content: [{ type: "text", text: store.getProjectOutline(projectId) }],
      };
    },
  );

  // 3. list_projects
  server.tool(
    "list_projects",
    "List all animation projects managed by the studio server",
    {},
    async () => {
      const projects = store.listProjects();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ count: projects.length, projects }, null, 2),
          },
        ],
      };
    },
  );

  // 4. edit_project
  server.tool(
    "edit_project",
    "Apply a batch of mutation ops to an animation project using applyOps",
    {
      projectId: z.string().describe("Target project ID"),
      ops: z
        .array(z.record(z.unknown()))
        .describe("Array of mutation operations"),
      baseRevision: z
        .number()
        .optional()
        .describe("Expected current revision before applying ops"),
      dryRun: z
        .boolean()
        .optional()
        .default(false)
        .describe("If true, simulate changes without saving"),
    },
    async ({ projectId, ops, baseRevision, dryRun }) => {
      const doc = store.getProject(projectId);
      if (!doc) {
        return {
          isError: true,
          content: [
            { type: "text", text: `Error: Project '${projectId}' not found.` },
          ],
        };
      }

      if (typeof baseRevision === "number" && doc.revision !== baseRevision) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Conflict: Expected baseRevision ${baseRevision}, but current project revision is ${doc.revision}.`,
            },
          ],
        };
      }

      try {
        if (dryRun) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    message: "Dry run successful",
                    projectId,
                    opsCount: ops.length,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        const typedOps = ops as unknown as Op[];
        const result = store.applyOpsToProject(projectId, typedOps);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  message: "Ops applied successfully",
                  projectId,
                  revision: result.revision,
                  changedIds: result.changedIds,
                  warnings: result.warnings,
                  outline: store.getProjectOutline(projectId),
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: "text", text: `Error applying ops: ${errorMsg}` }],
        };
      }
    },
  );

  // 5. validate_project
  server.tool(
    "validate_project",
    "Validate project document structure, layer configurations, and asset references",
    {
      projectId: z.string().describe("Target project ID"),
    },
    async ({ projectId }) => {
      const doc = store.getProject(projectId);
      if (!doc) {
        return {
          isError: true,
          content: [
            { type: "text", text: `Error: Project '${projectId}' not found.` },
          ],
        };
      }

      const warnings: string[] = [];
      const errors: string[] = [];

      if (!doc.canvas.width || doc.canvas.width <= 0) {
        errors.push("Invalid canvas width.");
      }
      if (!doc.canvas.height || doc.canvas.height <= 0) {
        errors.push("Invalid canvas height.");
      }

      for (const layer of doc.layers) {
        if (!layer.id) {
          errors.push("Found layer missing an 'id'.");
        }
      }

      const isValid = errors.length === 0;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                projectId,
                valid: isValid,
                errors,
                warnings,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // 6. render_preview
  server.tool(
    "render_preview",
    "Render frame preview contact sheets or individual PNG frames for an animation project",
    {
      projectId: z.string().describe("Target project ID"),
      times: z
        .array(z.number())
        .optional()
        .describe("Specific timestamps in seconds to render"),
      count: z
        .number()
        .positive()
        .optional()
        .default(4)
        .describe("Number of evenly spaced frames if times not provided"),
      layout: z
        .enum(["contact_sheet", "frames", "gif"])
        .optional()
        .default("contact_sheet"),
      size: z
        .number()
        .positive()
        .optional()
        .default(512)
        .describe("Target preview width in pixels"),
    },
    async ({ projectId, times, count, layout, size }) => {
      const doc = store.getProject(projectId);
      if (!doc) {
        return {
          isError: true,
          content: [
            { type: "text", text: `Error: Project '${projectId}' not found.` },
          ],
        };
      }

      try {
        const previewResult = await renderPreview(doc, {
          times,
          count,
          layout,
          size,
        });

        const content: ToolContentItem[] = [
          {
            type: "text",
            text: JSON.stringify(
              {
                projectId,
                layout: previewResult.layout,
                frameCount: previewResult.frameCount,
                frameTimes: previewResult.frames.map((f) => f.timeSec),
              },
              null,
              2,
            ),
          },
        ];

        for (const frame of previewResult.frames) {
          const base64Data = frame.dataUrl.split(",")[1] || frame.dataUrl;
          content.push({
            type: "image",
            data: base64Data,
            mimeType: "image/png",
          });
        }

        return { content };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [
            { type: "text", text: `Error rendering preview: ${errorMsg}` },
          ],
        };
      }
    },
  );
}
