import { spawn } from 'child_process';
import { build } from 'esbuild';
import { createServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function start() {
  // Build electron scripts
  await build({
    entryPoints: ['electron/main.ts', 'electron/preload.ts'],
    bundle: true,
    platform: 'node',
    outdir: 'dist-electron',
    external: ['electron']
  });

  // Start Vite server
  const server = await createServer({
    configFile: path.resolve(__dirname, 'vite.config.ts')
  });
  await server.listen();
  server.printUrls();
  const url = server.resolvedUrls.local[0];

  // Start Electron
  const electronProcess = spawn('npx', ['electron', '.'], {
    env: { ...process.env, VITE_DEV_SERVER_URL: url },
    stdio: 'inherit'
  });

  electronProcess.on('close', () => {
    server.close();
    process.exit();
  });
}

start();
