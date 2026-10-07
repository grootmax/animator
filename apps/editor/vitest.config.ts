import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    exclude: ['tests/**', 'dist/**', 'dist-electron/**', 'node_modules/**']
  }
});
