import { RuntimePlayer } from '@monorepo/runtime-player';
import { generate100kProject } from './generator';
import { createMatrix, multiplyMatrix } from '@monorepo/math';

declare global {
  interface Window {
    __perf_results__?: any;
    __perf_done__?: boolean;
  }
}

async function runBenchmark() {
  console.log('Starting benchmark...');
  const results: any = {};

  // Relative Baseline Check
  const baselineStart = performance.now();
  let m1 = createMatrix();
  let m2 = createMatrix();
  m1[0] = 1.1; m2[1] = 0.5;
  for (let i = 0; i < 1000000; i++) {
    m1 = multiplyMatrix(m1, m2);
  }
  const baselineEnd = performance.now();
  results.baselineMatrixTime = baselineEnd - baselineStart;
  console.log('Baseline Matrix 1M Time:', results.baselineMatrixTime);

  // Generation Phase
  const genStart = performance.now();
  const project = generate100kProject();
  const genEnd = performance.now();
  results.generationTime = genEnd - genStart;
  console.log('Project Generation Time:', results.generationTime);

  // Load Phase
  const canvas = document.getElementById('stage') as HTMLCanvasElement;
  const player = new RuntimePlayer(canvas);

  const loadStart = performance.now();
  player.load(project);
  const loadEnd = performance.now();
  results.loadTime = loadEnd - loadStart;
  console.log('Load & Init Recalculate Time:', results.loadTime);

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
      const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
      
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
        violationPercent
      };

      console.log('Playback Finished:', results.frameMetrics);
      
      window.__perf_results__ = results;
      window.__perf_done__ = true;
      resolve();
    }
  });
}

runBenchmark().catch(console.error);
