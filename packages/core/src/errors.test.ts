import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AnimatorError, formatErrorPath } from "./errors.js";

describe("AnimatorError", () => {
  it("formats error paths correctly", () => {
    expect(formatErrorPath([])).toBe("");
    expect(formatErrorPath(["canvas"])).toBe("canvas");
    expect(formatErrorPath(["canvas", "width"])).toBe("canvas.width");
    expect(formatErrorPath(["layers", 3, "presets", 1])).toBe(
      "layers[3].presets[1]",
    );
    expect(formatErrorPath(["layers", 0, "shape", "kind"])).toBe(
      "layers[0].shape.kind",
    );
  });

  it("constructs AnimatorError with full options", () => {
    const error = new AnimatorError("Canvas duration invalid", {
      code: "ERR_INVALID_CANVAS",
      path: "canvas.duration",
      hint: "Duration must be positive.",
    });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AnimatorError);
    expect(error.name).toBe("AnimatorError");
    expect(error.message).toBe("Canvas duration invalid");
    expect(error.code).toBe("ERR_INVALID_CANVAS");
    expect(error.path).toBe("canvas.duration");
    expect(error.hint).toBe("Duration must be positive.");
  });

  it("constructs AnimatorError from positional arguments", () => {
    const error = new AnimatorError(
      "Layer missing",
      "ERR_LAYER_NOT_FOUND",
      "layers[2]",
      "Ensure layer exists",
    );

    expect(error.code).toBe("ERR_LAYER_NOT_FOUND");
    expect(error.path).toBe("layers[2]");
    expect(error.hint).toBe("Ensure layer exists");
  });

  it("constructs AnimatorError from ZodError unrecognized_keys", () => {
    const schema = z.object({ width: z.number() }).strict();
    const result = schema.safeParse({ width: 100, bogusField: "invalid" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const animErr = AnimatorError.fromZodError(result.error);
      expect(animErr.code).toBe("ERR_UNKNOWN_FIELD");
      expect(animErr.path).toBe("bogusField");
      expect(animErr.hint).toContain("Remove unrecognized property");
    }
  });

  it("constructs AnimatorError from ZodError invalid_type", () => {
    const schema = z.object({ width: z.number() });
    const result = schema.safeParse({ width: "not-a-number" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const animErr = AnimatorError.fromZodError(result.error);
      expect(animErr.code).toBe("ERR_INVALID_TYPE");
      expect(animErr.path).toBe("width");
      expect(animErr.hint).toContain("Expected number");
    }
  });
});
