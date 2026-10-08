import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

async function run() {
  console.log("Starting Vite server...");
  const viteBin = path.resolve(
    path.dirname(require.resolve("vite")),
    "../../bin/vite.js",
  );
  const viteProcess = spawn(
    process.execPath,
    [viteBin, "--port", "4173", "--strictPort"],
    {
      cwd: __dirname,
      stdio: "pipe",
    },
  );

  await new Promise((resolve, reject) => {
    let resolved = false;
    viteProcess.stdout.on("data", (data) => {
      const output = data.toString();
      console.log("VITE:", output);
      if (
        !resolved &&
        (output.includes("localhost:4173") || output.includes("ready in"))
      ) {
        resolved = true;
        resolve();
      }
    });
    viteProcess.stderr.on("data", (data) => {
      console.error("VITE ERR:", data.toString());
    });
    viteProcess.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });
    viteProcess.on("exit", (code) => {
      if (!resolved && code !== 0) {
        resolved = true;
        reject(new Error(`Vite server exited with code ${code}`));
      }
    });
  });

  console.log("Server started. Launching Puppeteer...");

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    });

    const page = await browser.newPage();
    page.on("console", (msg) => console.log("BROWSER:", msg.text()));

    console.log("Navigating to http://localhost:4173 ...");
    await page.goto("http://localhost:4173", {
      waitUntil: "domcontentloaded",
      timeout: 0,
    });

    console.log("Waiting for benchmark to complete...");

    await page.waitForFunction(() => window.__perf_done__ === true, {
      timeout: 60000,
    });

    const results = await page.evaluate(() => window.__perf_results__);
    console.log("=== Benchmark Results ===");
    console.log(JSON.stringify(results, null, 2));

    const { frameMetrics, baselineMatrixTime } = results;

    const baselineFactor = baselineMatrixTime / 150.0;
    const maxStdDev = Math.max(15, 15 * baselineFactor);

    console.log(`Baseline Factor: ${baselineFactor.toFixed(2)}x`);
    console.log(
      `Allowed StdDev: ${maxStdDev.toFixed(2)}ms, Actual: ${frameMetrics.stdDev?.toFixed(2) || "N/A"}ms`,
    );

    let failed = false;
    let reason = "";

    if (frameMetrics.totalFrames < 10) {
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
      `${JSON.stringify(results, null, 2)}\n`,
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
    viteProcess.kill();
    process.exit();
  }
}

run();
