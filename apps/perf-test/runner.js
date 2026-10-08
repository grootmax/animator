const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const path = require('path');

async function run() {
  console.log('Starting Vite server...');
  const viteProcess = spawn('npx', ['vite', '--port', '4173'], {
    cwd: __dirname,
    stdio: 'pipe',
  });

  let serverUrl = 'http://localhost:4173';
  await new Promise((resolve) => {
    viteProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('VITE:', output);
      const match = output.match(/http:\/\/localhost:(\d+)/);
      if (match) {
        serverUrl = match[0];
      }
      if (output.includes('ready in')) {
        resolve();
      }
    });
    viteProcess.stderr.on('data', (data) => {
      console.error('VITE ERR:', data.toString());
    });
  });

  console.log('Server started. Launching Puppeteer...');

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const page = await browser.newPage();
    page.on('pageerror', (err) => console.error('BROWSER PAGE ERROR:', err));
    page.on('console', async (msg) => {
      const args = await Promise.all(msg.args().map(arg => arg.jsonValue().catch(() => arg.toString())));
      console.log('BROWSER:', ...args);
    });

    console.log(`Navigating to ${serverUrl} ...`);
    await page.goto(serverUrl, { waitUntil: 'domcontentloaded', timeout: 0 });

    console.log('Waiting for benchmark to complete...');
    
    // Increase timeout since generation and 5s playback will take at least 6-10s
    await page.waitForFunction(() => window.__perf_done__ === true, { timeout: 60000 });

    const results = await page.evaluate(() => window.__perf_results__);
    console.log('=== Benchmark Results ===');
    console.log(JSON.stringify(results, null, 2));

    const { frameMetrics, baselineMatrixTime } = results;

    // Check performance logic
    // We want to fail if standard deviation is too high, or violation percent is > threshold.
    // Given the 100K nodes, running in a headless VM might be slow.
    // The relative baseline approach: check if frame time is proportional to baseline.
    
    // Baseline check scaling: assume baseline time of 150ms on CI means ~1x factor.
    const baselineFactor = baselineMatrixTime / 150.0;
    
    // Scale acceptable jank threshold based on baseline factor
    const maxStdDev = Math.max(15, 15 * baselineFactor); 
    
    // Also, we can check that we aren't completely deadlocked.
    // (Handled below)

    console.log(`Baseline Factor: ${baselineFactor.toFixed(2)}x`);
    console.log(`Allowed StdDev: ${maxStdDev.toFixed(2)}ms, Actual: ${frameMetrics.stdDev?.toFixed(2) || 'N/A'}ms`);

    let failed = false;
    let reason = '';

    if (frameMetrics.totalFrames < 10) {
      failed = true;
      reason = 'Too few frames rendered (application is severely lagging).';
    } else if (frameMetrics.stdDev > maxStdDev) {
      failed = true;
      reason = `High jank detected! Frame time standard deviation (${frameMetrics.stdDev.toFixed(2)}ms) exceeded threshold (${maxStdDev.toFixed(2)}ms).`;
    }

    results.passed = !failed;
    results.reason = reason;
    results.maxStdDev = maxStdDev;

    const fs = require('fs');
    fs.writeFileSync(path.join(__dirname, 'perf-results.json'), JSON.stringify(results, null, 2));

    if (failed) {
      console.warn(`⚠️ PERFORMANCE TEST FAILED: ${reason}`);
      process.exitCode = 1;
    } else {
      console.log(`✅ Performance within acceptable bounds.`);
    }

  } catch (err) {
    console.error('Test script crashed:', err);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    viteProcess.kill();
    process.exit();
  }
}

run();
