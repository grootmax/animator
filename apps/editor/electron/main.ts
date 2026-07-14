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

const activeSaves = new Map<string, { stream: fs.WriteStream, filePath: string }>();

ipcMain.handle('startSave', async () => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    filters: [{ name: 'JSON files', extensions: ['json'] }]
  });
  if (canceled || !filePath) return null;
  
  // Check if file is currently being saved to block concurrent saves to the same file
  for (const [id, save] of activeSaves.entries()) {
    if (save.filePath === filePath) {
      console.warn("Already saving to this file");
      return null;
    }
  }

  const saveId = Math.random().toString(36).substring(2, 15);
  const stream = fs.createWriteStream(filePath, 'utf-8');
  activeSaves.set(saveId, { stream, filePath });
  return saveId;
});

ipcMain.handle('writeChunk', async (_, saveId: string, chunk: string) => {
  const save = activeSaves.get(saveId);
  if (!save) return false;
  
  return new Promise<boolean>((resolve) => {
    if (!save.stream.write(chunk)) {
      save.stream.once('drain', () => resolve(true));
    } else {
      resolve(true);
    }
  });
});

ipcMain.handle('endSave', async (_, saveId: string, success: boolean) => {
  const save = activeSaves.get(saveId);
  if (!save) return false;

  return new Promise<boolean>((resolve) => {
    save.stream.end(async () => {
      activeSaves.delete(saveId);
      if (!success) {
        try {
          await fs.promises.unlink(save.filePath);
        } catch (e) {
          console.error("Failed to cleanup file", e);
        }
      }
      resolve(true);
    });
  });
});
