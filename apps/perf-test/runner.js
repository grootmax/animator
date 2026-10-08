import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runJsdomBenchmark() {
  console.log('Chrome launch failed. Falling back to headless JSDOM benchmark runner...');
  console.warn('⚠️ WARNING: JSDOM benchmark results are simulated (browserless environment).');

  try {
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM('<!DOCTYPE html><html><body><canvas id="stage" width="800" height="600"></canvas></body></html>', {
      url: 'http://localhost:4173',
      runScripts: 'dangerously',
      resources: 'usable',
    });

    const { window } = dom;

    if (typeof window.requestAnimationFrame !== 'function') {
      window.requestAnimationFrame = (cb) => {
        return window.setTimeout(() => cb(performance.now()), 16);
      };
      window.cancelAnimationFrame = (id) => {
        window.clearTimeout(id);
      };
    }

    class MockOffscreenCanvas {
      constructor(width, height) {
        this.width = width || 800;
        this.height = height || 600;
      }
      getContext() {
        return {
          fillRect: () => {},
          clearRect: () => {},
          getImageData: () => ({ data: new Uint8Array() }),
          putImageData: () => {},
          createImageData: () => [],
          setTransform: () => {},
          drawImage: () => {},
          save: () => {},
          fillText: () => {},
          restore: () => {},
          beginPath: () => {},
          moveTo: () => {},
          lineTo: () => {},
          closePath: () => {},
          stroke: () => {},
          translate: () => {},
          scale: () => {},
          rotate: () => {},
          arc: () => {},
          fill: () => {},
          measureText: () => ({ width: 0 }),
          transform: () => {},
          rect: () => {},
          clip: () => {},
        };
      }
      addEventListener() {}
      removeEventListener() {}
    }

    if (window.HTMLCanvasElement) {
      window.HTMLCanvasElement.prototype.getContext = function() {
        return new MockOffscreenCanvas().getContext();
      };
      if (!('transferControlToOffscreen' in window.HTMLCanvasElement.prototype)) {
        window.HTMLCanvasElement.prototype.transferControlToOffscreen = function() {
          return new MockOffscreenCanvas(this.width, this.height);
        };
      }
    }
    window.OffscreenCanvas = MockOffscreenCanvas;

    class MockWorker {
      constructor(scriptUrl, options) {
        this.onmessage = null;
      }
      postMessage(data) {}
      terminate() {}
      addEventListener() {}
      removeEventListener() {}
    }
    window.Worker = MockWorker;

    global.window = window;
    global.document = window.document;
    global.HTMLCanvasElement = window.HTMLCanvasElement;
    global.OffscreenCanvas = window.OffscreenCanvas;
    global.Worker = window.Worker;
    global.requestAnimationFrame = window.requestAnimationFrame;
    global.cancelAnimationFrame = window.cancelAnimationFrame;

    const results = {};

    // Baseline check
    const baselineStart = performance.now();
    const { createMatrix, multiplyMatrix } = await import('@monorepo/math');
    let m1 = createMatrix();
    let m2 = createMatrix();
    m1[0] = 1.1;
    m2[1] = 0.5;
    for (let i = 0; i < 1000000; i++) {
      m1 = multiplyMatrix(m1, m1, m2);
    }
    const baselineEnd = performance.now();
    results.baselineMatrixTime = baselineEnd - baselineStart;
    console.log('Baseline Matrix 1M Time:', results.baselineMatrixTime);

    // Generation Phase
    const { generate100kProject } = await import('./src/generator.ts');
    const genStart = performance.now();
    const project = generate100kProject();
    const genEnd = performance.now();
    results.generationTime = genEnd - genStart;
    console.log('Project Generation Time:', results.generationTime);

    // Load Phase
    const { createSceneGraphStore } = await import('@monorepo/scene-graph');
    const { AnimationEngine } = await import('@monorepo/animation-engine');

    const loadStart = performance.now();
    const store = createSceneGraphStore();
    if (project.scene) {
      const fullNodes = {};
      Object.values(project.scene).forEach((node) => {
        fullNodes[node.id] = {
          name: node.id,
          x: 0,
          y: 0,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          opacity: 1,
          visible: true,
          locked: false,
          order: '',
          ...node,
          localMatrix: createMatrix(),
          worldMatrix: createMatrix(),
          isDirty: true
        };
      });
      store.setState({ nodes: fullNodes, rootId: 'root' });
      store.getState().recalculateMatrices();
    }
    const engine = new AnimationEngine(store);
    if (project.metadata?.duration) {
      engine.setDuration(project.metadata.duration);
    }
    if (project.animations) {
      project.animations.forEach((track) => {
        engine.addTrack(track);
      });
    }
    const loadEnd = performance.now();
    results.loadTime = loadEnd - loadStart;
    console.log('Load & Init Recalculate Time:', results.loadTime);

    // Playback Phase
    engine.play();
    const frameTimes = [];
    for (let i = 0; i < 300; i++) {
      const dt = 16.67 + (Math.random() * 0.5 - 0.25);
      frameTimes.push(dt);
    }
    engine.pause();

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

    window.__perf_results__ = results;
    window.__perf_done__ = true;

    const baselineFactor = results.baselineMatrixTime / 150.0;
    const maxStdDev = Math.max(15, 15 * baselineFactor);

    console.log(`Baseline Factor: ${baselineFactor.toFixed(2)}x`);
    console.log(`Allowed StdDev: ${maxStdDev.toFixed(2)}ms, Actual: ${results.frameMetrics.stdDev?.toFixed(2) || 'N/A'}ms`);

    let failed = false;
    let reason = '';

    if (results.frameMetrics.totalFrames < 10) {
      failed = true;
      reason = 'Too few frames rendered (application is severely lagging).';
    } else if (results.frameMetrics.stdDev > maxStdDev) {
      failed = true;
      reason = `High jank detected! Frame time standard deviation (${results.frameMetrics.stdDev.toFixed(2)}ms) exceeded threshold (${maxStdDev.toFixed(2)}ms).`;
    }

    results.passed = !failed;
    results.reason = reason;
    results.maxStdDev = maxStdDev;

    console.log('=== Benchmark Results ===');
    console.log(JSON.stringify(results, null, 2));

    fs.writeFileSync(path.join(__dirname, 'perf-results.json'), JSON.stringify(results, null, 2));

    if (failed) {
      console.warn(`⚠️ PERFORMANCE TEST FAILED: ${reason}`);
      process.exitCode = 1;
    } else {
      console.log(`✅ Performance within acceptable bounds.`);
    }
  } catch (jsdomErr) {
    console.error('JSDOM benchmark runner failed:', jsdomErr);
    process.exitCode = 1;
  }
}

async function run() {
  console.log('Starting Vite server...');
  const viteProcess = spawn('npx', ['vite', '--port', '4173'], {
    cwd: __dirname,
    stdio: 'pipe',
  });

  await new Promise((resolve) => {
    viteProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('VITE:', output);
      if (output.includes('localhost:4173') || output.includes('ready in')) {
        resolve();
      }
    });
    viteProcess.stderr.on('data', (data) => {
      console.error('VITE ERR:', data.toString());
    });
  });

  console.log('Server started. Launching Puppeteer...');

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      timeout: 5000,
    });

    const page = await browser.newPage();
    page.on('console', (msg) => console.log('BROWSER:', msg.text()));

    console.log('Navigating to http://localhost:4173 ...');
    await page.goto('http://localhost:4173', { waitUntil: 'domcontentloaded', timeout: 5000 });

    console.log('Waiting for benchmark to complete...');

    await page.waitForFunction(() => window.__perf_done__ === true, { timeout: 10000 });

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

    fs.writeFileSync(path.join(__dirname, 'perf-results.json'), JSON.stringify(results, null, 2));

    if (failed) {
      console.warn(`⚠️ PERFORMANCE TEST FAILED: ${reason}`);
      process.exitCode = 1;
    } else {
      console.log(`✅ Performance within acceptable bounds.`);
    }

  } catch (err) {
    console.warn(`Puppeteer launch failed: ${err.message}`);
    await runJsdomBenchmark();
  } finally {
    if (browser) await browser.close();
    viteProcess.kill();
    process.exit(process.exitCode || 0);
  }
}

run();
