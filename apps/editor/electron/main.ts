import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

let mainWindow: BrowserWindow | null = null;

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

const activeStreams = new Map<string, fs.WriteStream>();

ipcMain.handle('saveStream:start', async () => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    filters: [{ name: 'JSON files', extensions: ['json'] }]
  });
  if (canceled || !filePath) return null;
  
  const id = Date.now().toString() + Math.random().toString();
  const stream = fs.createWriteStream(filePath, { encoding: 'utf-8' });
  activeStreams.set(id, stream);
  return id;
});

ipcMain.handle('saveStream:chunk', async (_, id: string, chunk: string) => {
  const stream = activeStreams.get(id);
  if (!stream) return false;
  
  if (stream.write(chunk)) {
    return true;
  }
  
  return new Promise((resolve) => {
    stream.once('drain', () => resolve(true));
  });
});

ipcMain.handle('saveStream:end', async (_, id: string) => {
  const stream = activeStreams.get(id);
  if (!stream) return false;
  
  return new Promise((resolve) => {
    stream.end(() => {
      activeStreams.delete(id);
      resolve(true);
    });
  });
});
