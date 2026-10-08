import { describe, expect, it } from "vitest";
import {
  CORE_VERSION,
  type ProjectData,
  compileProjectToLottie,
  validateLottieSchema,
} from "./index.js";

describe("@animator/core compiler and validator", () => {
  it("core version is defined", () => {
    expect(CORE_VERSION).toBe("0.0.0");
  });

  it("compiles and validates a simple project", () => {
    const project: ProjectData = {
      canvas: { width: 500, height: 500, fps: 30, duration: 1 },
      layers: [
        {
          id: "circle-1",
          type: "circle",
          shape: { kind: "circle", size: [100, 100] },
          fill: "#00FF00",
        },
      ],
    };

    const lottie = compileProjectToLottie(project);
    expect(lottie).toBeTypeOf("string");

    const result = validateLottieSchema(lottie);
    expect(result.valid).toBe(true);
  });
});
