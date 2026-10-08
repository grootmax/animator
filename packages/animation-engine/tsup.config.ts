import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  outDir: 'dist',
  outExtension() {
    return {
      js: '.js',
      dts: '.d.ts',
    };
  },
});
