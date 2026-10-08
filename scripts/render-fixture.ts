import fs from "node:fs";
import path from "node:path";
import {
  renderContactSheet,
  renderFrame,
} from "../packages/render/src/index.js";

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error(
      "Usage: pnpm render:fixture <name> [frame] [--contact-sheet]",
    );
    process.exit(1);
  }

  const firstName = args[0];
  if (!firstName) {
    console.error("Missing fixture name argument");
    process.exit(1);
  }
  const name = firstName.replace(/\.json$/, "");
  const isContactSheet = args.includes("--contact-sheet");
  const frameArg = args.find((a) => !a.startsWith("--") && a !== name);
  const frame = frameArg ? Number.parseInt(frameArg, 10) : 15;

  let fixturePath = path.resolve(process.cwd(), `fixtures/${name}.json`);
  if (!fs.existsSync(fixturePath)) {
    fixturePath = path.resolve(
      process.cwd(),
      `packages/render/fixtures/${name}.json`,
    );
  }

  if (!fs.existsSync(fixturePath)) {
    console.error(`Fixture not found: ${name} (checked fixtures/${name}.json)`);
    process.exit(1);
  }

  const lottieStr = fs.readFileSync(fixturePath, "utf8");
  const rendersDir = path.resolve(process.cwd(), "renders");
  fs.mkdirSync(rendersDir, { recursive: true });

  if (isContactSheet) {
    const pngBytes = await renderContactSheet({
      lottie: lottieStr,
      cols: 4,
      rows: 4,
      frameCount: 16,
      background: "#0B1020",
    });
    const outPath = path.join(rendersDir, `${name}-contact-sheet.png`);
    fs.writeFileSync(outPath, pngBytes);
    console.log(`Rendered contact sheet to ${outPath}`);
  } else {
    const pngBytes = await renderFrame({
      lottie: lottieStr,
      frame,
      width: 100,
      height: 100,
      background: "#0B1020",
    });
    const outPath = path.join(rendersDir, `${name}-${frame}.png`);
    fs.writeFileSync(outPath, pngBytes);
    console.log(`Rendered frame ${frame} to ${outPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
