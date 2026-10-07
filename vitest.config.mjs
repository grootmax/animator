import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/tests/e2e.spec.ts',
      '**/*.spec.ts',
    ],
  },
});
