import { app, BrowserWindow, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { IpcBridge } from './ipc-bridge';
import { z } from './validator';

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

const ProjectSchema = z.jsonString(
  z.object({
    scene: z.record(
      z.object({
        id: z.string(),
        name: z.string(),
        type: z.string(),
        parentId: z.nullable(z.string()),
        children: z.array(z.string()),
        x: z.number(),
        y: z.number(),
        rotation: z.number(),
        scaleX: z.number(),
        scaleY: z.number(),
        opacity: z.number(),
        visible: z.boolean(),
        locked: z.boolean()
      })
    ),
    animations: z.array(
      z.object({
        nodeId: z.string(),
        property: z.string(),
        keyframes: z.array(
          z.object({
            time: z.number(),
            value: z.number()
          })
        )
      })
    ),
    metadata: z.object({
      version: z.string(),
      duration: z.number()
    })
  })
);

// IPC Handlers using Bridge
IpcBridge.register({
  channel: 'dialog:openFile',
  handler: async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'SVG files', extensions: ['svg'] }]
    });
    if (canceled || filePaths.length === 0) return null;
    
    if (!IpcBridge.isExtensionAllowed(filePaths[0], ['svg'])) {
      console.error(`[SECURITY AUDIT] Blocked reading file with unverified extension: ${filePaths[0]}`);
      return null;
    }
    
    return fs.promises.readFile(filePaths[0], 'utf-8');
  }
});

IpcBridge.register({
  channel: 'dialog:saveFile',
  schema: ProjectSchema,
  handler: async (_, content: string) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      filters: [{ name: 'JSON files', extensions: ['json'] }]
    });
    if (canceled || !filePath) return false;
    
    if (!IpcBridge.isExtensionAllowed(filePath, ['json'])) {
      console.error(`[SECURITY AUDIT] Blocked writing file with unverified extension: ${filePath}`);
      return false; // Prevent writing to an unapproved format
    }
    
    await fs.promises.writeFile(filePath, content, 'utf-8');
    return true;
  }
});
