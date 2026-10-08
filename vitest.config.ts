import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/editor/src/**/*.test.ts", "apps/editor/src/**/*.test.tsx"],
  },
});
