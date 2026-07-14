import { _electron as electron, test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

test.describe('Multi-OS Integrity Suite', () => {
  let app: any;

  test.beforeEach(async () => {
    // Launch Electron app
    app = await electron.launch({
      args: [path.join(__dirname, '../dist-electron/main.js')],
      env: {
        ...process.env,
        TEST_MODE: 'true',
        NODE_ENV: 'production'
      }
    });
  });

  test.afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  test('should trigger native open dialog, read file, and update UI', async () => {
    const window = await app.firstWindow();
    
    // Wait for app to load
    await window.waitForSelector('text=Layers');

    // Initially, there should be no layers
    await expect(window.locator('text=No layers yet')).toBeVisible();

    // Click Import SVG button
    await window.getByTitle('Import SVG').click();

    // The mock test.svg should be loaded, which creates a rect layer
    await expect(window.locator('text=No layers yet')).not.toBeVisible();
    await expect(window.locator('text=rect')).toBeVisible();
  });

  test('should trigger native save dialog and write state to disk', async () => {
    const window = await app.firstWindow();
    
    await window.waitForSelector('text=Layers');

    // Add a test animation which creates a node
    await window.locator('text=Add Test Anim').click();
    await expect(window.locator('text=rect')).toBeVisible();

    const tempFile = path.join(os.tmpdir(), 'test-save.json');
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }

    // Click Export JSON button
    await window.getByTitle('Export JSON').click();

    // Wait a brief moment for the save to complete
    await window.waitForTimeout(1000);

    // Verify file was written to temp directory
    expect(fs.existsSync(tempFile)).toBeTruthy();

    const content = fs.readFileSync(tempFile, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed).toHaveProperty('scene');
    expect(Object.keys(parsed.scene).length).toBeGreaterThan(0);
    
    // Clean up
    fs.unlinkSync(tempFile);
  });
});
