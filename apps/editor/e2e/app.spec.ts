import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

let electronApp: ElectronApplication;
let window: Page;

test.beforeAll(async () => {
  // Build the app first if necessary, but we assume it's built or being run correctly.
  electronApp = await electron.launch({ 
    args: [path.join(__dirname, '../dist-electron/main.js')],
    env: {
      ...process.env,
      // Pass a flag to indicate testing if needed, though we test real build here
    }
  });
  window = await electronApp.firstWindow();
});

test.afterAll(async () => {
  await electronApp.close();
});

test('App should open and load correctly', async () => {
  const isCrashed = await window.isClosed();
  expect(isCrashed).toBe(false);
  // Verify app title or root element
  await window.waitForSelector('#root');
});

test('nodeIntegration should be disabled and contextIsolation enabled', async () => {
  // Attempt to access process which shouldn't be available if nodeIntegration is false
  const isProcessDefined = await window.evaluate(() => {
    return typeof process !== 'undefined' && process.versions && process.versions.node;
  });
  expect(isProcessDefined).toBeFalsy();

  // Verify electronAPI is available via context bridge
  const isElectronApiDefined = await window.evaluate(() => {
    return typeof (window as any).electronAPI !== 'undefined';
  });
  expect(isElectronApiDefined).toBeTruthy();
});

test('IPC bridge exposes only authorized methods', async () => {
  const apiMethods = await window.evaluate(() => {
    const api = (window as any).electronAPI;
    return Object.keys(api).sort();
  });
  
  expect(apiMethods).toEqual(['openFile', 'saveFile'].sort());
});

test('Mocking openFile IPC pathway', async () => {
  const testFilePath = path.join(__dirname, 'mocked_file.svg');
  fs.writeFileSync(testFilePath, '<svg>mocked</svg>', 'utf-8');

  // We can mock the dialog.showOpenDialog in the main process
  await electronApp.evaluate(({ dialog }, pathArg) => {
    dialog.showOpenDialog = () => Promise.resolve({
      canceled: false,
      filePaths: [pathArg]
    });
  }, testFilePath);
  
  const content = await window.evaluate(async () => {
    return await (window as any).electronAPI.openFile();
  });
  
  expect(content).toBe('<svg>mocked</svg>');
});

test('Mocking saveFile IPC pathway', async () => {
  const testSavePath = path.join(__dirname, 'mocked_save.json');
  if (fs.existsSync(testSavePath)) {
    fs.unlinkSync(testSavePath);
  }

  // Mock dialog.showSaveDialog
  await electronApp.evaluate(({ dialog }, pathArg) => {
    dialog.showSaveDialog = () => Promise.resolve({
      canceled: false,
      filePath: pathArg
    });
  }, testSavePath);

  const success = await window.evaluate(async () => {
    return await (window as any).electronAPI.saveFile('{"data":"test"}');
  });
  
  expect(success).toBe(true);
  
  const savedContent = fs.readFileSync(testSavePath, 'utf-8');
  expect(savedContent).toBe('{"data":"test"}');
});
