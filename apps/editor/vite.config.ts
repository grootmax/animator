import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import path from 'path';

export default defineConfig({
  base: './',
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  resolve: {
    alias: {
      '@monorepo/math': path.resolve(__dirname, '../../packages/math/src/index.ts'),
      '@monorepo/scene-graph': path.resolve(__dirname, '../../packages/scene-graph/src/index.ts'),
      '@monorepo/renderer': path.resolve(__dirname, '../../packages/renderer/src/index.ts'),
      '@monorepo/animation-engine': path.resolve(__dirname, '../../packages/animation-engine/src/index.ts'),
      '@monorepo/serialization': path.resolve(__dirname, '../../packages/serialization/src/index.ts'),
      '@monorepo/runtime-player': path.resolve(__dirname, '../../apps/runtime-player/src/index.ts'),
    },
  },
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        onstart(options) {
          options.startup();
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload();
        },
      }
    ]),
  ],
});
