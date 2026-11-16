import fs from "node:fs";
import path from "node:path";

export interface MotionDocCanvas {
  width: number;
  height: number;
  fps: number;
  duration: number;
  background?: string;
}

export interface MotionDocParam {
  type: "color" | "text" | "number";
  value: unknown;
  label?: string;
}

export interface MotionDocLayer {
  id: string;
  type: "shape" | "text" | "image" | "group" | "lottie";
  name?: string;
  position?: [number, number];
  children?: MotionDocLayer[];
  presets?: Array<{
    name: string;
    at?: number;
    duration?: number;
    params?: Record<string, unknown>;
  }>;
  keyframes?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface MotionDoc {
  version: number;
  name: string;
  canvas: MotionDocCanvas;
  params?: Record<string, MotionDocParam>;
  assets?: unknown[];
  layers: MotionDocLayer[];
  videoTrack?: unknown[];
}

/**
 * Resolves the root directory containing the templates folder.
 */
export function getTemplatesDir(overrideDir?: string): string {
  if (overrideDir) {
    return path.resolve(overrideDir);
  }

  // Walk up from current dir or __dirname to find templates/
  let current = process.cwd();
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(current, "templates");
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  // Fallback relative to import.meta.dirname
  const fromMeta = path.resolve(import.meta.dirname, "../../../templates");
  if (fs.existsSync(fromMeta)) {
    return fromMeta;
  }

  return path.resolve(process.cwd(), "templates");
}

/**
 * Parses and validates a JSON string or object as a Motion Doc template.
 */
export function parseTemplate(input: string | object): MotionDoc {
  const doc = (
    typeof input === "string" ? JSON.parse(input) : input
  ) as MotionDoc;

  if (!doc || typeof doc !== "object") {
    throw new Error("Invalid template: expected an object");
  }

  if (doc.version !== 1) {
    throw new Error(
      `Unsupported template version: expected 1, got ${doc.version}`,
    );
  }

  if (typeof doc.name !== "string" || !doc.name.trim()) {
    throw new Error("Invalid template: missing or invalid 'name' field");
  }

  if (!doc.canvas || typeof doc.canvas !== "object") {
    throw new Error("Invalid template: missing 'canvas' configuration");
  }

  const { width, height, fps, duration } = doc.canvas;
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    typeof fps !== "number" ||
    typeof duration !== "number"
  ) {
    throw new Error(
      "Invalid template canvas: width, height, fps, and duration must be numbers",
    );
  }

  if (!Array.isArray(doc.layers)) {
    throw new Error("Invalid template: 'layers' must be an array");
  }

  return doc;
}

/**
 * Resolves the absolute path to a template by its name or file path.
 */
export function getTemplatePath(
  templateName: string,
  overrideDir?: string,
): string {
  const dir = getTemplatesDir(overrideDir);
  const cleanName = templateName.replace(/\.(motion\.)?json$/, "");

  const motionCandidate = path.join(dir, `${cleanName}.motion.json`);
  if (fs.existsSync(motionCandidate)) {
    return motionCandidate;
  }

  const jsonCandidate = path.join(dir, `${cleanName}.json`);
  if (fs.existsSync(jsonCandidate)) {
    return jsonCandidate;
  }

  throw new Error(
    `Template not found: '${templateName}' in directory '${dir}'`,
  );
}

/**
 * Lists all template names available in the templates directory.
 */
export async function listTemplates(overrideDir?: string): Promise<string[]> {
  const dir = getTemplatesDir(overrideDir);
  if (!fs.existsSync(dir)) {
    return [];
  }

  const entries = await fs.promises.readdir(dir);
  const templateNames = new Set<string>();

  for (const entry of entries) {
    if (entry.endsWith(".motion.json")) {
      templateNames.add(entry.slice(0, -".motion.json".length));
    } else if (entry.endsWith(".json")) {
      templateNames.add(entry.slice(0, -".json".length));
    }
  }

  return Array.from(templateNames).sort();
}

/**
 * Loads and parses a template by name into a MotionDoc structure.
 */
export async function loadTemplate(
  templateName: string,
  overrideDir?: string,
): Promise<MotionDoc> {
  const filePath = getTemplatePath(templateName, overrideDir);
  const content = await fs.promises.readFile(filePath, "utf8");
  return parseTemplate(content);
}
