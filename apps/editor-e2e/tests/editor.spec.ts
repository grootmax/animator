import { _electron as electron, test, expect, ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

let electronApp: ElectronApplication;
let window: Page;

test.beforeAll(async () => {
  const mainPath = path.join(__dirname, '../../editor/dist-electron/main.js');
  // Build electron first if needed, assume it's built
  electronApp = await electron.launch({ args: [mainPath] });
  window = await electronApp.firstWindow();
  window.on('console', msg => console.log('Browser console:', msg.text()));
});

test.afterAll(async () => {
  await electronApp.close();
});

test.describe('Electron IPC File Operations', () => {
  test('dialog:openFile (Successful)', async () => {
    // Setup a dummy SVG file
    const tempFilePath = path.join(__dirname, 'test-import.svg');
    const dummySvg = `<svg width="100" height="100"><rect x="10" y="10" width="80" height="80" fill="#ff0000"/></svg>`;
    fs.writeFileSync(tempFilePath, dummySvg, 'utf-8');

    // Mock open dialog
    await electronApp.evaluate(async ({ dialog }, filePath) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [filePath]
      });
    }, tempFilePath);

    // Initial check of nodes - wait for import button
    const importBtn = window.locator('button[title="Import SVG"]');
    await expect(importBtn).toBeVisible();

    // Verify initial empty state
    await expect(window.locator('text=No layers yet')).toBeVisible();

    // Click Import
    await importBtn.click();

    // Verify the imported node appears in the layer panel
    await expect(window.locator('text=No layers yet')).toBeHidden();
    
    // Clean up
    fs.unlinkSync(tempFilePath);
  });

  test('dialog:openFile (Cancelled)', async () => {
    await electronApp.evaluate(async ({ dialog }) => {
      dialog.showOpenDialog = async () => ({
        canceled: true,
        filePaths: []
      });
    });

    const importBtn = window.locator('button[title="Import SVG"]');
    await importBtn.click();
    // Test passes if no crash
  });

  test('dialog:saveFile (Successful)', async () => {
    const tempSavePath = path.join(__dirname, 'test-export.json');
    if (fs.existsSync(tempSavePath)) fs.unlinkSync(tempSavePath);

    await electronApp.evaluate(async ({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath
      });
    }, tempSavePath);

    const exportBtn = window.locator('button[title="Export JSON"]');
    await exportBtn.click();

    // Wait for file to be created
    await expect.poll(() => fs.existsSync(tempSavePath)).toBeTruthy();
    
    const content = fs.readFileSync(tempSavePath, 'utf-8');
    expect(content).toContain('"scene":');
    
    // Clean up
    fs.unlinkSync(tempSavePath);
  });

  test('dialog:saveFile (Cancelled)', async () => {
    await electronApp.evaluate(async ({ dialog }) => {
      dialog.showSaveDialog = async () => ({
        canceled: true,
        filePath: undefined
      });
    });

    const exportBtn = window.locator('button[title="Export JSON"]');
    await exportBtn.click();
    // No error is expected
  });
});
