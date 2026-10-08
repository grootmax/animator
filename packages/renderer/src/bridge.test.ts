import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as PIXI from 'pixi.js';
import { createSceneGraphStore } from '@monorepo/scene-graph';
import { PixiBridge } from './bridge';

vi.mock('pixi.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('pixi.js')>();
  class MockApplication {
    stage = new actual.Container();
    ticker = { add: vi.fn() };
    screen = new actual.Rectangle(0, 0, 800, 600);
    view = {
      captureStream: vi.fn(() => new (globalThis as any).MediaStream()),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      style: {},
    };
  }
  class MockGraphics extends actual.Container {
    clear = vi.fn();
    beginFill = vi.fn();
    endFill = vi.fn();
    lineStyle = vi.fn();
    drawRect = vi.fn();
    drawCircle = vi.fn();
    drawEllipse = vi.fn();
    moveTo = vi.fn();
    lineTo = vi.fn();
    closePath = vi.fn();
    bezierCurveTo = vi.fn();
  }
  return {
    ...actual,
    Application: MockApplication,
    Graphics: MockGraphics as any,
  };
});

// Mock WebAudio and HTMLVideoElement for Node/Vitest environment if not globally present
class MockGainNode {
  gain = { value: 1 };
  connect = vi.fn();
  disconnect = vi.fn();
}

class MockMediaElementAudioSourceNode {
  connect = vi.fn();
  disconnect = vi.fn();
}

class MockAudioDestinationNode {
  stream = {
    getAudioTracks: () => [{} as MediaStreamTrack],
  } as unknown as MediaStream;
}

class MockAudioContext {
  createMediaStreamDestination = vi.fn(() => new MockAudioDestinationNode());
  createMediaElementSource = vi.fn(() => new MockMediaElementAudioSourceNode());
  createGain = vi.fn(() => new MockGainNode());
}

class MockHTMLVideoElement extends EventTarget {
  currentTime = 0;
  paused = true;
  seeking = false;
  muted = false;
  volume = 1;
  playbackRate = 1;
  loop = false;

  pause = vi.fn(() => {
    this.paused = true;
  });

  play = vi.fn(async () => {
    this.paused = false;
  });
}

describe('PixiBridge Video Sync & WebAudio Capture', () => {
  let mockCanvas: HTMLCanvasElement;
  let store: ReturnType<typeof createSceneGraphStore>;
  let bridge: PixiBridge;

  beforeEach(() => {
    // Setup window / global / DOM mocks
    if (typeof globalThis.document === 'undefined') {
      (globalThis as any).document = {
        createElement: vi.fn((type: string) => {
          if (type === 'canvas') {
            return {
              getContext: vi.fn(() => ({
                createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
                fillRect: vi.fn(),
                getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
                putImageData: vi.fn(),
              })),
              width: 1,
              height: 1,
            };
          }
          return {};
        }),
      };
    }

    if (typeof window !== 'undefined') {
      (window as any).AudioContext = MockAudioContext;
      (window as any).document = (globalThis as any).document;
      if (!(window as any).addEventListener) {
        (window as any).addEventListener = vi.fn();
        (window as any).removeEventListener = vi.fn();
      }
    } else {
      (global as any).AudioContext = MockAudioContext;
      (global as any).window = {
        AudioContext: MockAudioContext,
        document: (globalThis as any).document,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        devicePixelRatio: 1,
      };
    }

    if (typeof global.MediaStream === 'undefined') {
      (global as any).MediaStream = class MockMediaStream {
        private tracks: any[] = [];
        addTrack(track: any) {
          this.tracks.push(track);
        }
        getVideoTracks() {
          return [{}];
        }
        getAudioTracks() {
          return this.tracks;
        }
      };
    }

    mockCanvas = {
      getContext: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      captureStream: vi.fn(() => new (global as any).MediaStream()),
      style: {},
      width: 800,
      height: 600,
    } as unknown as HTMLCanvasElement;

    store = createSceneGraphStore();
    bridge = new PixiBridge(mockCanvas, store);
  });

  it('syncs single video asset with clip offsets and duration', async () => {
    const videoNodeId = 'video_node_1';
    store.getState().addNode({
      id: videoNodeId,
      type: 'video',
      startTime: 1000, // Starts at t=1000ms on canvas
      mediaOffset: 500, // Clip starts 500ms into source video
      duration: 3000, // 3000ms duration on canvas
      volume: 0.8,
      muted: false,
      loop: false,
    });

    const mockVideo = new MockHTMLVideoElement() as unknown as HTMLVideoElement;
    bridge.registerVideoElement(videoNodeId, mockVideo);

    // Test time before start time: should set to mediaOffset (0.5s)
    await bridge.syncVideoAssets(200);
    expect(mockVideo.currentTime).toBe(0.5);
    expect(mockVideo.paused).toBe(true);

    // Test time active inside clip: t=2000ms -> elapsed 1000ms + mediaOffset 500ms = 1500ms (1.5s)
    const syncPromise = bridge.syncVideoAssets(2000);
    // Simulate DOM 'seeked' event firing
    mockVideo.dispatchEvent(new Event('seeked'));
    await syncPromise;

    expect(mockVideo.currentTime).toBe(1.5);
    expect(mockVideo.paused).toBe(true);
  });

  it('supports looping video clip calculations', async () => {
    const videoNodeId = 'video_loop';
    store.getState().addNode({
      id: videoNodeId,
      type: 'video',
      startTime: 0,
      mediaOffset: 0,
      duration: 2000, // 2 second duration
      loop: true,
    });

    const mockVideo = new MockHTMLVideoElement() as unknown as HTMLVideoElement;
    bridge.registerVideoElement(videoNodeId, mockVideo);

    // t=3500ms -> (3500 % 2000) = 1500ms -> 1.5s
    const syncPromise = bridge.syncVideoAssets(3500);
    mockVideo.dispatchEvent(new Event('seeked'));
    await syncPromise;

    expect(mockVideo.currentTime).toBe(1.5);
  });

  it('handles 500ms timeout guard if video seeked event does not fire', async () => {
    vi.useFakeTimers();

    const videoNodeId = 'video_hanging';
    store.getState().addNode({
      id: videoNodeId,
      type: 'video',
      startTime: 0,
      mediaOffset: 0,
      duration: 5000,
    });

    const mockVideo = new MockHTMLVideoElement() as unknown as HTMLVideoElement;
    bridge.registerVideoElement(videoNodeId, mockVideo);

    const syncPromise = bridge.syncVideoAssets(2000);

    // Fast-forward 500ms timeout
    vi.advanceTimersByTime(550);
    await syncPromise;

    expect(mockVideo.currentTime).toBe(2);

    vi.useRealTimers();
  });

  it('routes video audio to WebAudio MediaStreamDestination during export', () => {
    const videoNodeId = 'video_audio';
    store.getState().addNode({
      id: videoNodeId,
      type: 'video',
      startTime: 0,
      mediaOffset: 0,
      duration: 5000,
      volume: 0.75,
      muted: false,
    });

    const mockVideo = new MockHTMLVideoElement() as unknown as HTMLVideoElement;
    bridge.registerVideoElement(videoNodeId, mockVideo);

    const mockAudioCtx = new MockAudioContext() as unknown as AudioContext;
    const dest = bridge.setupExportAudioStream(mockAudioCtx);

    expect(dest).toBeDefined();
    expect(mockAudioCtx.createMediaElementSource).toHaveBeenCalledWith(mockVideo);

    const combinedStream = bridge.getExportMediaStream(mockAudioCtx);
    expect(combinedStream).toBeDefined();
    expect(combinedStream.getAudioTracks().length).toBeGreaterThan(0);
  });
});
