import { app, BrowserWindow, ipcMain, dialog, protocol } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

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
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
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
    return new Response(entry.data, {
      headers: { 'Content-Type': entry.mimeType }
    });
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
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
  const { canceled, filePath } = await dialog.showSaveDialog({
    filters: [{ name: 'JSON files', extensions: ['json'] }]
  });
  if (canceled || !filePath) return false;
  await fs.promises.writeFile(filePath, content, 'utf-8');
  return true;
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
