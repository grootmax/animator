import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    environment: 'node',
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/apps/editor/tests/**',
      '**/writerUtils.test.ts',
      '**/*.spec.ts',
    ],
  },
} as any);
