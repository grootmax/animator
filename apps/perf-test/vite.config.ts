import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@animator/core",
        replacement: path.resolve(
          __dirname,
          "../../packages/core/src/index.ts",
        ),
      },
    ],
  },
});
