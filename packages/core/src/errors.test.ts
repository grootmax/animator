import { describe, expect, it } from "vitest";
import { AnimatorError } from "./errors.js";

describe("AnimatorError", () => {
  it("creates an error with default values", () => {
    const error = new AnimatorError("Something went wrong");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AnimatorError);
    expect(error.name).toBe("AnimatorError");
    expect(error.message).toBe("Something went wrong");
    expect(error.code).toBe("ANIMATOR_ERROR");
    expect(error.path).toBeUndefined();
    expect(error.hint).toBeUndefined();
    expect(error.metadata).toBeUndefined();
  });

  it("creates an error with custom code, path, hint, metadata, and cause", () => {
    const cause = new Error("Underlying reason");
    const error = new AnimatorError("Layer not found", {
      code: "LAYER_NOT_FOUND",
      path: "layers.hero",
      hint: "Create the layer before referencing it",
      metadata: { requestedId: "hero" },
      cause,
    });

    expect(error.code).toBe("LAYER_NOT_FOUND");
    expect(error.path).toBe("layers.hero");
    expect(error.hint).toBe("Create the layer before referencing it");
    expect(error.metadata).toEqual({ requestedId: "hero" });
    expect(error.cause).toBe(cause);
  });
});
