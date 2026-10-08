import { CORE_VERSION } from "@animator/core";
import { type ExportedProject, generate100kProject } from "./generator.js";

declare global {
  interface Window {
    __perf_results__?: unknown;
    __perf_done__?: boolean;
  }
}

function createMatrix(): Float32Array {
  return new Float32Array([1, 0, 0, 1, 0, 0]);
}

function multiplyMatrix(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(6);
  const a0 = a[0] ?? 0;
  const a1 = a[1] ?? 0;
  const a2 = a[2] ?? 0;
  const a3 = a[3] ?? 0;
  const a4 = a[4] ?? 0;
  const a5 = a[5] ?? 0;

  const b0 = b[0] ?? 0;
  const b1 = b[1] ?? 0;
  const b2 = b[2] ?? 0;
  const b3 = b[3] ?? 0;
  const b4 = b[4] ?? 0;
  const b5 = b[5] ?? 0;

  out[0] = a0 * b0 + a2 * b1;
  out[1] = a1 * b0 + a3 * b1;
  out[2] = a0 * b2 + a2 * b3;
  out[3] = a1 * b2 + a3 * b3;
  out[4] = a0 * b4 + a2 * b5 + a4;
  out[5] = a1 * b4 + a3 * b5 + a5;
  return out;
}

class RuntimePlayer {
  canvas: HTMLCanvasElement;
  project: ExportedProject | null = null;
  animating = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  load(project: ExportedProject) {
    this.project = project;
  }

  play() {
    this.animating = true;
  }

  pause() {
    this.animating = false;
  }
}

async function runBenchmark() {
  console.log("Starting benchmark... Core version:", CORE_VERSION);
  const results: Record<string, unknown> = {};

  // Relative Baseline Check
  const baselineStart = performance.now();
  let m1 = createMatrix();
  const m2 = createMatrix();
  m1[0] = 1.1;
  m2[1] = 0.5;
  for (let i = 0; i < 1000000; i++) {
    m1 = multiplyMatrix(m1, m2);
  }
  const baselineEnd = performance.now();
  results.baselineMatrixTime = baselineEnd - baselineStart;
  console.log("Baseline Matrix 1M Time:", results.baselineMatrixTime);

  // Generation Phase
  const genStart = performance.now();
  const project = generate100kProject();
  const genEnd = performance.now();
  results.generationTime = genEnd - genStart;
  console.log("Project Generation Time:", results.generationTime);

  // Load Phase
  const canvas = document.getElementById("stage") as HTMLCanvasElement;
  const player = new RuntimePlayer(canvas);

  const loadStart = performance.now();
  player.load(project);
  const loadEnd = performance.now();
  results.loadTime = loadEnd - loadStart;
  console.log("Load & Init Recalculate Time:", results.loadTime);

  // Playback Phase
  player.play();

  let frameCount = 0;
  const frameTimes: number[] = [];
  let lastFrameTime = performance.now();

  const PLAYBACK_DURATION_MS = 5000;
  let startTime = 0;
  let warmupFrames = 5;

  return new Promise<void>((resolve) => {
    function tick() {
      const now = performance.now();

      if (warmupFrames > 0) {
        warmupFrames--;
        if (warmupFrames === 0) {
          startTime = performance.now();
          lastFrameTime = performance.now();
        }
        requestAnimationFrame(tick);
        return;
      }

      const dt = now - lastFrameTime;
      lastFrameTime = now;

      frameTimes.push(dt);
      frameCount++;

      if (now - startTime < PLAYBACK_DURATION_MS) {
        requestAnimationFrame(tick);
      } else {
        player.pause();
        finishPlayback();
      }
    }

    requestAnimationFrame(tick);

    function finishPlayback() {
      // Calculate metrics
      const avgFrameTime =
        frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;

      let varianceSum = 0;
      let violations = 0;
      for (const t of frameTimes) {
        varianceSum += (t - avgFrameTime) ** 2;
        if (t > 16.67) {
          violations++;
        }
      }

      const stdDev = Math.sqrt(varianceSum / frameTimes.length);
      const violationPercent = (violations / frameTimes.length) * 100;

      results.frameMetrics = {
        totalFrames: frameTimes.length,
        avgFrameTime,
        stdDev,
        violations,
        violationPercent,
      };

      console.log("Playback Finished:", results.frameMetrics);

      window.__perf_results__ = results;
      window.__perf_done__ = true;
      resolve();
    }
  });
}

runBenchmark().catch(console.error);
