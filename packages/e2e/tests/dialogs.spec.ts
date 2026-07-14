import { _electron as electron, ElectronApplication, Page } from '@playwright/test';
import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

let electronApp: ElectronApplication;
let window: Page;

test.beforeAll(async () => {
  const mainPath = path.join(__dirname, '../../../apps/editor/dist-electron/main.js');
  electronApp = await electron.launch({ args: [mainPath] });
  window = await electronApp.firstWindow();
});

test.afterAll(async () => {
  await electronApp.close();
});

test('dialog:openFile verifies the IPC channel and returns file content', async () => {
  const testFilePath = path.join(__dirname, 'test-open.svg');

  // We can evaluate in the main process to mock the dialog
  await electronApp.evaluate(({ dialog }, openPath) => {
    dialog.showOpenDialog = async () => {
      return {
        canceled: false,
        filePaths: [openPath]
      };
    };
  }, testFilePath);
  await fs.promises.writeFile(testFilePath, '<svg></svg>', 'utf-8');

  // Trigger from renderer
  const content = await window.evaluate(async () => {
    return await (window as any).electronAPI.openFile();
  });

  expect(content).toBe('<svg></svg>');

  // Clean up
  await fs.promises.unlink(testFilePath);
});

test('dialog:saveFile verifies the IPC channel and saves file content', async () => {
  const saveFilePath = path.join(__dirname, 'test-save.json');

  await electronApp.evaluate(({ dialog }, savePath) => {
    dialog.showSaveDialog = async () => {
      return {
        canceled: false,
        filePath: savePath
      };
    };
  }, saveFilePath);

  const testContent = '{"test": true}';

  // Trigger from renderer
  const success = await window.evaluate(async (content) => {
    return await (window as any).electronAPI.saveFile(content);
  }, testContent);

  expect(success).toBe(true);

  // Verify file was written
  const writtenContent = await fs.promises.readFile(saveFilePath, 'utf-8');
  expect(writtenContent).toBe(testContent);

  // Clean up
  await fs.promises.unlink(saveFilePath);
});
