import { app, BrowserWindow, ipcMain, dialog, protocol } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { setupSecurity } from './security';

setupSecurity();

let mainWindow: BrowserWindow | null = null;

interface AssetCacheEntry {
  data: Buffer;
  mimeType: string;
}

const activeAssets = new Map<string, AssetCacheEntry>();

protocol.registerSchemesAsPrivileged([
  { scheme: 'studio', privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(app.getAppPath(), 'dist-electron/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Security Hardening: Navigation guards
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    const isDev = !!process.env.VITE_DEV_SERVER_URL;
    let isAllowed = false;

    if (isDev && process.env.VITE_DEV_SERVER_URL) {
      const devServerUrl = new URL(process.env.VITE_DEV_SERVER_URL);
      if (parsedUrl.origin === devServerUrl.origin) {
        isAllowed = true;
      }
    }
    
    if (parsedUrl.protocol === 'file:') {
      isAllowed = true;
    }

    if (!isAllowed) {
      console.warn(`Blocked unauthorized navigation to: ${navigationUrl}`);
      event.preventDefault();
    }
  });

  // Security Hardening: Window open handlers
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.warn(`Blocked unauthorized window open request for: ${url}`);
    return { action: 'deny' };
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), 'dist/index.html'));
  }

  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      const parsedUrl = new URL(url);
      if (process.env.VITE_DEV_SERVER_URL) {
        const devUrl = new URL(process.env.VITE_DEV_SERVER_URL);
        if (parsedUrl.origin !== devUrl.origin) {
          event.preventDefault();
        }
      } else {
        if (parsedUrl.protocol !== 'file:' || !parsedUrl.pathname.includes('/dist/index.html')) {
          event.preventDefault();
        }
      }
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  setupSecurity();
  protocol.handle('studio', async (request) => {
    let rawUrl = request.url;
    if (rawUrl.startsWith('studio://')) {
      rawUrl = rawUrl.substring(9);
    }
    // Remove query params and leading/trailing slashes
    const assetName = decodeURIComponent(rawUrl.split('?')[0].replace(/^\/*/, '').replace(/\/*$/, ''));
    
    const entry = activeAssets.get(assetName);
    if (!entry) {
      return new Response('Not Found', { status: 404 });
    }
    return new Response(new Uint8Array(entry.data), {
      headers: { 'Content-Type': entry.mimeType }
    });
  });
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  app.on('web-contents-created', (_, contents) => {
    contents.on('will-navigate', (event, navigationUrl) => {
      const parsedUrl = new URL(navigationUrl);
      const isLocalUrl = 
        parsedUrl.protocol === 'file:' || 
        (process.env.VITE_DEV_SERVER_URL && parsedUrl.origin === new URL(process.env.VITE_DEV_SERVER_URL).origin);
      
      if (!isLocalUrl) {
        event.preventDefault();
      }
    });

    contents.setWindowOpenHandler(() => {
      return { action: 'deny' };
    });

    contents.on('will-attach-webview', (event) => {
      event.preventDefault();
    });
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle('dialog:openFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'SVG files', extensions: ['svg'] }]
  });
  if (canceled) return null;
  return fs.promises.readFile(filePaths[0], 'utf-8');
});

ipcMain.handle('dialog:saveFile', async (_, content: string) => {
  try {
    JSON.parse(content);
  } catch (error) {
    return false;
  }

  try {
    const { canceled, filePath } = await dialog.showSaveDialog({
      filters: [{ name: 'JSON files', extensions: ['json'] }]
    });

    if (canceled || !filePath) return false;

    if (path.extname(filePath).toLowerCase() !== '.json') {
      return false;
    }

    await fs.promises.writeFile(filePath, content, 'utf-8');
    return true;
  } catch (error) {
    return false;
  }
});

ipcMain.handle('bundle:save', async (_, manifest: any, assets: Array<{ name: string; data: Uint8Array, mimeType: string }>) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    filters: [{ name: 'Studio Bundle', extensions: ['studio'] }]
  });
  if (canceled || !filePath) return false;

  const manifestObj = { ...manifest, assets: {} };
  
  let currentOffset = 0;
  for (const asset of assets) {
    manifestObj.assets[asset.name] = {
      offset: currentOffset,
      size: asset.data.length,
      mimeType: asset.mimeType || 'application/octet-stream'
    };
    currentOffset += asset.data.length;
  }

  const manifestStr = JSON.stringify(manifestObj);
  const manifestBuffer = Buffer.from(manifestStr, 'utf-8');
  
  const header = Buffer.from('STUDIO', 'ascii');
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32LE(manifestBuffer.length, 0);
  
  const buffers = [header, lengthBuffer, manifestBuffer];
  for (const asset of assets) {
    buffers.push(Buffer.from(asset.data));
  }
  
  const finalBuffer = Buffer.concat(buffers);
  await fs.promises.writeFile(filePath, finalBuffer);
  
  return true;
});

ipcMain.handle('bundle:open', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Studio Bundle', extensions: ['studio'] }, { name: 'All Files', extensions: ['*'] }]
  });
  if (canceled || filePaths.length === 0) return null;

  const fileData = await fs.promises.readFile(filePaths[0]);
  
  const header = fileData.subarray(0, 6).toString('ascii');
  if (header !== 'STUDIO') {
    throw new Error('Invalid bundle format: Missing STUDIO magic bytes');
  }
  
  const manifestLength = fileData.readUInt32LE(6);
  const manifestBuffer = fileData.subarray(10, 10 + manifestLength);
  const manifestStr = manifestBuffer.toString('utf-8');
  const manifest = JSON.parse(manifestStr);
  
  const payloadStart = 10 + manifestLength;
  
  const assets: Array<{ name: string; data: Uint8Array, mimeType: string }> = [];
  
  activeAssets.clear();

  if (manifest.assets) {
    for (const [name, meta] of Object.entries(manifest.assets)) {
      const offset = payloadStart + (meta as any).offset;
      const size = (meta as any).size;
      const mimeType = (meta as any).mimeType;
      
      const assetData = fileData.subarray(offset, offset + size);
      assets.push({ name, data: new Uint8Array(assetData), mimeType });
      
      activeAssets.set(name, {
        data: assetData,
        mimeType
      });
    }
  }
  
  return { manifest, assets };
});

ipcMain.handle('asset:import', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (canceled || filePaths.length === 0) return null;
  
  const filePath = filePaths[0];
  const name = path.basename(filePath);
  const data = await fs.promises.readFile(filePath);
  
  let mimeType = 'application/octet-stream';
  const ext = path.extname(name).toLowerCase();
  if (ext === '.png') mimeType = 'image/png';
  else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
  else if (ext === '.gif') mimeType = 'image/gif';
  else if (ext === '.svg') mimeType = 'image/svg+xml';
  
  activeAssets.set(name, { data, mimeType });
  
  return { name, data: new Uint8Array(data), mimeType };
});
