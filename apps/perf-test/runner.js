const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const {
  Browser,
  computeExecutablePath,
  detectBrowserPlatform,
  install,
} = require("@puppeteer/browsers");
const puppeteer = require("puppeteer");

async function ensureChromeBrowser() {
  let executablePath;
  try {
    executablePath = puppeteer.executablePath();
    if (executablePath && fs.existsSync(executablePath)) {
      console.log(`Using cached Chrome binary at: ${executablePath}`);
      return executablePath;
    }
  } catch (e) {
    // Executable path error or missing
  }

  const cacheDir = path.join(__dirname, ".cache", "puppeteer");
  const platform = detectBrowserPlatform();
  if (!platform) {
    throw new Error("Unsupported platform for @puppeteer/browsers detection");
  }

  const buildId = "119.0.6045.105";

  try {
    const localPath = computeExecutablePath({
      browser: Browser.CHROME,
      buildId: buildId,
      cacheDir: cacheDir,
      platform: platform,
    });
    if (fs.existsSync(localPath)) {
      console.log(`Using local cached Chrome binary at: ${localPath}`);
      return localPath;
    }
  } catch (e) {
    // Ignore and proceed to download
  }

  console.log(
    "Chrome binary missing from local cache. Provisioning compatible Chrome binary via @puppeteer/browsers...",
  );
  const installed = await install({
    browser: Browser.CHROME,
    buildId: buildId,
    cacheDir: cacheDir,
    platform: platform,
  });

  console.log(`Chrome binary downloaded to: ${installed.executablePath}`);
  return installed.executablePath;
}

async function startViteServer() {
  console.log("Starting Vite server on dynamic port (port 0)...");
  const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
  const viteProcess = spawn(npxCmd, ["vite", "--port", "0"], {
    cwd: __dirname,
    stdio: "pipe",
    shell: process.platform === "win32",
  });

  let serverUrl = "";

  await new Promise((resolve, reject) => {
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        reject(new Error("Timed out waiting for Vite server to start"));
      }
    }, 30000);

    const parseOutput = (data) => {
      const output = data.toString();
      console.log("VITE:", output);

      // Strip ANSI escape sequences
      // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape codes filtering
      const clean = output.replace(/\u001b\[[0-9;]*m/g, "");
      // Match URLs such as http://localhost:12345/ or http://127.0.0.1:12345/
      const match = clean.match(/http:\/\/(?:localhost|127\.0\.0\.1):(\d+)\/?/);
      if (match && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        serverUrl = match[0];
        if (!serverUrl.endsWith("/")) {
          serverUrl += "/";
        }
        resolve();
      }
    };

    viteProcess.stdout.on("data", parseOutput);
    viteProcess.stderr.on("data", (data) => {
      const output = data.toString();
      console.error("VITE ERR:", output);
      parseOutput(data);
    });

    viteProcess.on("error", (err) => {
      if (!resolved) {
        clearTimeout(timeout);
        reject(err);
      }
    });

    viteProcess.on("exit", (code) => {
      if (!resolved) {
        clearTimeout(timeout);
        reject(new Error(`Vite process exited prematurely with code ${code}`));
      }
    });
  });

  return { viteProcess, serverUrl };
}

async function run() {
  let viteProcess;
  let browser;

  try {
    const serverInfo = await startViteServer();
    viteProcess = serverInfo.viteProcess;
    const serverUrl = serverInfo.serverUrl;

    console.log(
      `Server bound dynamically to ${serverUrl}. Performing browser pre-flight checks...`,
    );
    const executablePath = await ensureChromeBrowser();

    console.log("Launching Puppeteer...");
    const launchOptions = {
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    };
    if (executablePath && fs.existsSync(executablePath)) {
      launchOptions.executablePath = executablePath;
    }

    browser = await puppeteer.launch(launchOptions);

    const page = await browser.newPage();
    page.on("console", (msg) => console.log("BROWSER:", msg.text()));
    page.on("pageerror", (err) =>
      console.error("PAGE ERROR:", err.message, err.stack),
    );

    console.log(`Navigating to ${serverUrl} ...`);
    await page.goto(serverUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    console.log("Waiting for benchmark to complete...");
    await page.waitForFunction(() => window.__perf_done__ === true, {
      timeout: 60000,
    });

    const results = await page.evaluate(() => window.__perf_results__);
    console.log("=== Benchmark Results ===");
    console.log(JSON.stringify(results, null, 2));

    const { frameMetrics, baselineMatrixTime } = results || {};
    const baselineFactor = (baselineMatrixTime || 150) / 150.0;
    const maxStdDev = Math.max(15, 15 * baselineFactor);

    console.log(`Baseline Factor: ${baselineFactor.toFixed(2)}x`);
    console.log(
      `Allowed StdDev: ${maxStdDev.toFixed(2)}ms, Actual: ${frameMetrics?.stdDev?.toFixed(2) || "N/A"}ms`,
    );

    let failed = false;
    let reason = "";

    if (!frameMetrics || frameMetrics.totalFrames < 10) {
      failed = true;
      reason = "Too few frames rendered (application is severely lagging).";
    } else if (frameMetrics.stdDev > maxStdDev) {
      failed = true;
      reason = `High jank detected! Frame time standard deviation (${frameMetrics.stdDev.toFixed(2)}ms) exceeded threshold (${maxStdDev.toFixed(2)}ms).`;
    }

    results.passed = !failed;
    results.reason = reason;
    results.maxStdDev = maxStdDev;

    fs.writeFileSync(
      path.join(__dirname, "perf-results.json"),
      JSON.stringify(results, null, 2),
    );

    if (failed) {
      console.warn(`⚠️ PERFORMANCE TEST FAILED: ${reason}`);
      process.exitCode = 1;
    } else {
      console.log("✅ Performance within acceptable bounds.");
    }
  } catch (err) {
    console.error("Test script crashed:", err);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    if (viteProcess) viteProcess.kill();
    process.exit();
  }
}

run();
