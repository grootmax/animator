import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/tests/**/*.spec.ts'],
  },
} as any);
