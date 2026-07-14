import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

let mainWindow: BrowserWindow | null = null;
let isSavingActive = false;
let activeWriteStream: fs.WriteStream | null = null;

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

  mainWindow.on('close', (e) => {
    if (isSavingActive) {
      e.preventDefault();
      // Optionally notify user
    }
  });
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

ipcMain.handle('saveFileStart', async () => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    filters: [{ name: 'JSON files', extensions: ['json'] }]
  });
  if (canceled || !filePath) return false;

  try {
    activeWriteStream = fs.createWriteStream(filePath, 'utf-8');
    isSavingActive = true;
    return true;
  } catch (error) {
    console.error('Failed to create write stream:', error);
    return false;
  }
});

ipcMain.handle('saveFileChunk', async (_, chunk: string) => {
  if (!activeWriteStream) return false;

  return new Promise((resolve, reject) => {
    activeWriteStream!.write(chunk, (error) => {
      if (error) {
        console.error('Failed to write chunk:', error);
        reject(error);
      } else {
        resolve(true);
      }
    });
  });
});

ipcMain.handle('saveFileEnd', async () => {
  if (!activeWriteStream) return false;

  return new Promise((resolve) => {
    activeWriteStream!.end(() => {
      activeWriteStream = null;
      isSavingActive = false;
      resolve(true);
    });
  });
});

ipcMain.handle('saveFileCancel', async () => {
  if (activeWriteStream) {
    activeWriteStream.destroy();
    activeWriteStream = null;
    isSavingActive = false;
  }
  return true;
});

ipcMain.handle('isSavingActive', () => {
  return isSavingActive;
});
