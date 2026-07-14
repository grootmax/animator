import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: [
      { find: '@monorepo/math', replacement: path.resolve(__dirname, '../../packages/math/src/index.ts') },
      { find: '@monorepo/scene-graph', replacement: path.resolve(__dirname, '../../packages/scene-graph/src/index.ts') },
      { find: '@monorepo/animation-engine', replacement: path.resolve(__dirname, '../../packages/animation-engine/src/index.ts') },
      { find: '@monorepo/renderer', replacement: path.resolve(__dirname, '../../packages/renderer/src/index.ts') },
      { find: '@monorepo/serialization', replacement: path.resolve(__dirname, '../../packages/serialization/src/index.ts') },
      { find: '@monorepo/runtime-player', replacement: path.resolve(__dirname, '../../apps/runtime-player/src/index.ts') }
    ]
  }
});
