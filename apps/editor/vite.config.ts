import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';

export default defineConfig({
  plugins: [
    react(),
    { name: 'ignore-worker', transform(code, id) { if (id.includes('runtime-player/dist/index.js')) return code.replace('import.meta.url', '""'); } },
    electron([
      {
        entry: 'electron/main.ts',
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
