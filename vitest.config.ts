import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["packages/*", "apps/*"],
    exclude: ["legacy/**", "**/legacy/**", "**/node_modules/**", "**/dist/**"],
  },
});
