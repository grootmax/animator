const fs = require("node:fs");
const { execSync } = require("node:child_process");
const puppeteer = require("puppeteer");

try {
  const executablePath = puppeteer.executablePath();
  if (executablePath && fs.existsSync(executablePath)) {
    console.log(
      `Local Chrome binary found at ${executablePath}, skipping download.`,
    );
    process.exit(0);
  }
} catch (e) {
  // Binary not found
}

console.log(
  "Local Chrome binary not found. Running puppeteer browsers install chrome...",
);
execSync("npx puppeteer browsers install chrome", { stdio: "inherit" });
