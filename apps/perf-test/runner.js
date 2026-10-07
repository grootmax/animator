const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const path = require('path');

async function run() {
  console.log('Starting Vite server...');
  const viteProcess = spawn('npx', ['vite'], {
    cwd: __dirname,
    stdio: 'pipe',
  });

  let serverPort = 4173;

  await new Promise((resolve) => {
    viteProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('VITE:', output);
      const match = output.match(/http:\/\/localhost:(\d+)/);
      if (match) {
        serverPort = parseInt(match[1], 10);
        resolve();
      } else if (output.includes('ready in')) {
        resolve();
      }
    });
    viteProcess.stderr.on('data', (data) => {
      console.error('VITE ERR:', data.toString());
    });
  });

  console.log(`Server started on port ${serverPort}. Launching Puppeteer...`);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const page = await browser.newPage();
    page.on('console', async (msg) => {
      const args = await Promise.all(msg.args().map(a => a.jsonValue().catch(() => a.toString())));
      console.log('BROWSER:', ...args);
    });
    page.on('pageerror', (err) => console.error('BROWSER PAGE ERROR:', err));

    const targetUrl = `http://localhost:${serverPort}`;
    console.log(`Navigating to ${targetUrl} ...`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 0 });

    console.log('Waiting for benchmark to complete...');
    await page.waitForFunction(() => window.__perf_done__ === true, { timeout: 60000 });

    const results = await page.evaluate(() => window.__perf_results__);
    console.log('=== Benchmark Results ===');
    console.log(JSON.stringify(results, null, 2));

    const { frameMetrics, baselineMatrixTime } = results;

    const baselineFactor = baselineMatrixTime / 150.0;
    const maxStdDev = Math.max(15, 15 * baselineFactor); 

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
