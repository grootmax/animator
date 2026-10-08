import fs from "node:fs";
import path from "node:path";
import { renderFrame } from "../packages/render/src/index.js";

async function main() {
  const args = process.argv.slice(2);
  const fixtureName = args[0];
  const frameArg = args[1];

  if (!fixtureName) {
    console.error("Usage: pnpm render:fixture <fixture-name> [frame-number]");
    process.exit(1);
  }

  const frame = frameArg !== undefined ? Number.parseInt(frameArg, 10) : 0;
  if (Number.isNaN(frame)) {
    console.error(`Invalid frame number: ${frameArg}`);
    process.exit(1);
  }

  const rootDir = path.resolve(import.meta.dirname, "..");
  const fixturePath = path.join(rootDir, "fixtures", `${fixtureName}.json`);

  if (!fs.existsSync(fixturePath)) {
    console.error(`Fixture not found at: ${fixturePath}`);
    process.exit(1);
  }

  const lottieContent = fs.readFileSync(fixturePath, "utf8");
  console.log(`Rendering ${fixtureName}.json at frame ${frame}...`);

  const pngBytes = await renderFrame({
    lottie: lottieContent,
    frame,
  });

  const rendersDir = path.join(rootDir, "renders");
  if (!fs.existsSync(rendersDir)) {
    fs.mkdirSync(rendersDir, { recursive: true });
  }

  const outputPath = path.join(rendersDir, `${fixtureName}-${frame}.png`);
  fs.writeFileSync(outputPath, pngBytes);

  console.log(
    `Successfully rendered fixture to ${outputPath} (${pngBytes.length} bytes)`,
  );
}

main().catch((err) => {
  console.error("Error rendering fixture:", err);
  process.exit(1);
});
