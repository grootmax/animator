const fs = require("node:fs");
const net = require("node:net");
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

async function getRandomPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function startViteServer() {
  const port = await getRandomPort();
  console.log(
    `Starting Vite server programmatically on dynamic port ${port}...`,
  );

  const { createServer } = await import("vite");
  const viteServer = await createServer({
    configFile: path.join(__dirname, "vite.config.ts"),
    root: __dirname,
    server: {
      port,
      strictPort: true,
      host: "127.0.0.1",
    },
  });

  await viteServer.listen();
  const serverUrl = `http://127.0.0.1:${port}/`;
  return { viteServer, serverUrl };
}

async function run() {
  let viteServer;
  let browser;

  try {
    const serverInfo = await startViteServer();
    viteServer = serverInfo.viteServer;
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
    if (viteServer) await viteServer.close();
    process.exit();
  }
}

run();
