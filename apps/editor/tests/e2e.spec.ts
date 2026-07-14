import { test, expect, _electron as electron } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

test.describe('Electron App E2E', () => {
  let electronApp;
  let window;

  test.beforeAll(async () => {
    electronApp = await electron.launch({ args: ['.'] });
    window = await electronApp.firstWindow();
  });

  test.afterAll(async () => {
    await electronApp.close();
  });

  test('Critical application components are successfully bundled', async () => {
    const mainExists = fs.existsSync(path.join(__dirname, '../dist-electron/main.js'));
    const preloadExists = fs.existsSync(path.join(__dirname, '../dist-electron/preload.js'));
    const indexExists = fs.existsSync(path.join(__dirname, '../dist/index.html'));
    
    expect(mainExists).toBeTruthy();
    expect(preloadExists).toBeTruthy();
    expect(indexExists).toBeTruthy();
  });

  test('Launches application and window is visible', async () => {
    const isVisible = await window.isVisible();
    expect(isVisible).toBeTruthy();
  });

  test('IPC bridge security - Node.js integration should be disabled in renderer', async () => {
    const isNodeAvailable = await window.evaluate(() => {
      return typeof require !== 'undefined' || typeof process !== 'undefined' && process.versions && process.versions.node;
    });
    expect(isNodeAvailable).toBeFalsy();
  });

  test('Simulate Open File dialog', async () => {
    // We mock dialog.showOpenDialog to simulate user selecting a file
    const testSvgPath = path.join(__dirname, 'test.svg');
    try {
      fs.writeFileSync(testSvgPath, '<svg><rect width="100" height="100" /></svg>');
      
      await electronApp.evaluate(async ({ dialog }, pathArg) => {
        dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [pathArg] });
      }, testSvgPath);

      // Call electronAPI directly to simulate what the app does, or click the UI
      const fileContent = await window.evaluate(() => {
        return window.electronAPI.openFile();
      });
      
      expect(fileContent).toContain('<svg>');
    } finally {
      if (fs.existsSync(testSvgPath)) {
        fs.unlinkSync(testSvgPath);
      }
    }
  });

  test('Simulate Save File dialog', async () => {
    const testExportPath = path.join(__dirname, 'export-test.json');
    
    try {
      await electronApp.evaluate(async ({ dialog }, pathArg) => {
        dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath: pathArg });
      }, testExportPath);

      const success = await window.evaluate((content) => {
        return window.electronAPI.saveFile(content);
      }, '{"test":"data"}');
      
      expect(success).toBeTruthy();
      
      const savedContent = fs.readFileSync(testExportPath, 'utf-8');
      expect(savedContent).toBe('{"test":"data"}');
    } finally {
      if (fs.existsSync(testExportPath)) {
        fs.unlinkSync(testExportPath);
      }
    }
  });
});
