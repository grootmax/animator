import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/dist-electron/**', '**/e2e.spec.ts', '**/*.e2e.*'],
  },
});
