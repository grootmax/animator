import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@monorepo/math': resolve(__dirname, 'packages/math/src/index.ts'),
      '@monorepo/scene-graph': resolve(__dirname, 'packages/scene-graph/src/index.ts'),
      '@monorepo/animation-engine': resolve(__dirname, 'packages/animation-engine/src/index.ts'),
    }
  }
});
