import path from "node:path";
import { defineConfig } from "vitest/config";

const aliases = {
  "@animator/core": path.resolve(__dirname, "./packages/core/src/index.ts"),
  "@animator/render": path.resolve(__dirname, "./packages/render/src/index.ts"),
  "@animator/gen": path.resolve(__dirname, "./packages/gen/src/index.ts"),
};

export default defineConfig({
  resolve: {
    alias: aliases,
  },
  test: {
    alias: aliases,
    projects: ["packages/*", "apps/*"],
  },
});
