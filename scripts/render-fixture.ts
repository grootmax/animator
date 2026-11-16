import fs from "node:fs";
import path from "node:path";
import {
  renderContactSheet,
  renderFrame,
} from "../packages/render/src/index.js";

async function main() {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.length === 0) {
    console.error(
      "Usage: pnpm render:fixture <fixture-name> [frame-number] [--contact-sheet]",
    );
    process.exit(1);
  }

  const isContactSheet = rawArgs.includes("--contact-sheet");
  const filteredArgs = rawArgs.filter((arg) => !arg.startsWith("--"));

  const firstArg = filteredArgs[0];
  if (!firstArg) {
    console.error("Missing fixture name argument");
    process.exit(1);
  }

  const name = firstArg.replace(/\.(motion\.)?json$/, "");
  const frameArg = filteredArgs[1];

  const rootDir = path.resolve(import.meta.dirname, "..");
  const rendersDir = path.join(rootDir, "renders");
  if (!fs.existsSync(rendersDir)) {
    fs.mkdirSync(rendersDir, { recursive: true });
  }

  let fixturePath = path.join(rootDir, "fixtures", `${name}.json`);
  if (!fs.existsSync(fixturePath)) {
    fixturePath = path.join(rootDir, "fixtures", `${name}.motion.json`);
  }

  if (!fs.existsSync(fixturePath)) {
    console.error(`Fixture not found at: ${fixturePath}`);
    process.exit(1);
  }

  const fixtureContent = fs.readFileSync(fixturePath, "utf8");

  if (isContactSheet || (!frameArg && rawArgs.includes("--contact-sheet"))) {
    console.log(`Rendering contact sheet for ${name}...`);
    const pngBytes = await renderContactSheet({
      lottie: fixtureContent,
      cols: 4,
      rows: 4,
      frameCount: 16,
      background: "#0B1020",
    });
    const outPath = path.join(rendersDir, `${name}-contact-sheet.png`);
    fs.writeFileSync(outPath, pngBytes);
    console.log(
      `Successfully rendered contact sheet to ${outPath} (${pngBytes.length} bytes)`,
    );
    return;
  }

  const frame = frameArg !== undefined ? Number.parseInt(frameArg, 10) : 0;
  if (Number.isNaN(frame)) {
    console.error(`Invalid frame number: ${frameArg}`);
    process.exit(1);
  }

  console.log(`Rendering ${name} at frame ${frame}...`);
  const pngBytes = await renderFrame({
    lottie: fixtureContent,
    frame,
    background: "#0B1020",
  });

  const outPath = path.join(rendersDir, `${name}-${frame}.png`);
  fs.writeFileSync(outPath, pngBytes);
  console.log(
    `Successfully rendered fixture to ${outPath} (${pngBytes.length} bytes)`,
  );
}

main().catch((err) => {
  console.error("Error rendering fixture:", err);
  process.exit(1);
});
