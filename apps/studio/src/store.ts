import {
  type ApplyOpsResult,
  type Canvas,
  type MotionDoc,
  type Op,
  applyOps,
  createDefaultDoc,
} from "@animator/core";

export class ProjectStore {
  private projects = new Map<string, MotionDoc>();

  public createProject(params: {
    id?: string;
    name?: string;
    width?: number;
    height?: number;
    fps?: number;
    duration?: number;
    background?: string;
  }): { id: string; doc: MotionDoc } {
    const id =
      params.id || `proj-${Math.random().toString(36).substring(2, 9)}`;
    const doc = createDefaultDoc(
      params.name || "Untitled Project",
      params.width || 1080,
      params.height || 1080,
      params.fps || 30,
      params.duration || 4,
      params.background || "#0B1020",
    );
    this.projects.set(id, doc);
    return { id, doc };
  }

  public getProject(id: string): MotionDoc | undefined {
    return this.projects.get(id);
  }

  public listProjects(): Array<{
    id: string;
    name: string;
    revision: number;
    canvas: Canvas;
  }> {
    const result: Array<{
      id: string;
      name: string;
      revision: number;
      canvas: Canvas;
    }> = [];
    for (const [id, doc] of this.projects.entries()) {
      result.push({
        id,
        name: doc.name,
        revision: doc.revision || 0,
        canvas: doc.canvas,
      });
    }
    return result;
  }

  public applyOpsToProject(id: string, ops: Op[]): ApplyOpsResult {
    const doc = this.projects.get(id);
    if (!doc) {
      throw new Error(`Project with ID '${id}' not found.`);
    }

    const result = applyOps(doc, ops);
    this.projects.set(id, result.doc);
    return result;
  }

  public getProjectOutline(id: string): string {
    const doc = this.projects.get(id);
    if (!doc) {
      return `Project '${id}' not found.`;
    }

    const layerCount = doc.layers.length;
    const layerSummary = doc.layers
      .map((l) => `- ${l.id} (${l.type})`)
      .join("\n");
    return `Project: ${doc.name} (ID: ${id}, Revision: ${doc.revision})\nCanvas: ${doc.canvas.width}x${doc.canvas.height} @ ${doc.canvas.fps}fps, ${doc.canvas.duration}s\nLayers (${layerCount}):\n${layerSummary || " (no layers)"}`;
  }
}
