import {
  createAssetRegistryStore,
  createSceneGraphStore,
} from "@monorepo/scene-graph";
import { describe, expect, it, vi } from "vitest";
import {
  PixiBridge,
  connectVideoAudioToDestination,
  exportFrameByFrame,
} from "./bridge.js";

class MockVideoElement extends EventTarget {
  public currentTime = 0;
  public duration = 10;
  public volume = 1;
  public muted = false;
  public paused = true;

  public pause() {
    this.paused = true;
  }

  public play() {
    this.paused = false;
  }
}

describe("PixiBridge video asset seeking & audio capture", () => {
  it("syncVideoAssets seeks video elements to accurate clip offset and waits for seeked event", async () => {
    const store = createSceneGraphStore();
    const bridge = new PixiBridge({} as HTMLCanvasElement, store);

    const mockVideo = new MockVideoElement() as unknown as HTMLVideoElement;
    store.getState().addNode({
      id: "video-1",
      type: "video",
      startTime: 1000, // starts at 1000ms timeline
      mediaOffset: 500, // 500ms clip offset
      duration: 5000,
      loop: false,
    });

    bridge.registerVideoElement("video-1", mockVideo);

    // Trigger sync to 2000ms timeline time => expected clip time: (2000 - 1000) + 500 = 1500ms = 1.5s
    const syncPromise = bridge.syncVideoAssets(2000);

    // Simulate DOM 'seeked' event
    expect(mockVideo.currentTime).toBe(1.5);
    expect(mockVideo.paused).toBe(true); // Must remain paused during offline export
    mockVideo.dispatchEvent(new Event("seeked"));

    await syncPromise;
  });

  it("handles seeked timeout guard (500ms) to prevent export hangs if seek fails", async () => {
    vi.useFakeTimers();
    const store = createSceneGraphStore();
    const bridge = new PixiBridge({} as HTMLCanvasElement, store);

    const mockVideo = new MockVideoElement() as unknown as HTMLVideoElement;
    store.getState().addNode({
      id: "video-timeout",
      type: "video",
      startTime: 0,
      mediaOffset: 0,
      duration: 2000,
    });

    bridge.registerVideoElement("video-timeout", mockVideo);

    const syncPromise = bridge.syncVideoAssets(1000);
    expect(mockVideo.currentTime).toBe(1);

    // Do NOT dispatch 'seeked' event. Advance fake timer past 500ms timeout guard
    vi.advanceTimersByTime(550);

    await expect(syncPromise).resolves.toBeUndefined();
    vi.useRealTimers();
  });

  it("routes video audio through WebAudio MediaStreamAudioDestinationNode", () => {
    const mockAudioTracks: unknown[] = [{ id: "track-1", kind: "audio" }];
    const mockDestination = {
      stream: {
        getAudioTracks: () => mockAudioTracks,
      },
    };

    const mockGainNode = {
      gain: { value: 1 },
      connect: vi.fn(),
    };

    const mockSourceNode = {
      connect: vi.fn(),
    };

    const mockAudioCtx = {
      createMediaStreamDestination: () => mockDestination,
      createMediaElementSource: () => mockSourceNode,
      createGain: () => mockGainNode,
    } as unknown as AudioContext;

    const mockVideo = new MockVideoElement() as unknown as HTMLVideoElement;
    const { destination } = connectVideoAudioToDestination(
      [mockVideo],
      mockAudioCtx,
    );

    expect(destination.stream.getAudioTracks()).toHaveLength(1);
    expect(mockSourceNode.connect).toHaveBeenCalledWith(mockGainNode);
    expect(mockGainNode.connect).toHaveBeenCalledWith(mockDestination);
  });

  it("exportFrameByFrame awaits video seeking before each frame capture step", async () => {
    const store = createSceneGraphStore();
    const bridge = new PixiBridge({} as HTMLCanvasElement, store);

    const mockVideo = new MockVideoElement() as unknown as HTMLVideoElement;
    store.getState().addNode({
      id: "video-export",
      type: "video",
      startTime: 0,
      mediaOffset: 0,
      duration: 3000,
    });

    bridge.registerVideoElement("video-export", mockVideo);

    const capturedFrames: number[] = [];

    // Automatically emit seeked event whenever currentTime is updated
    Object.defineProperty(mockVideo, "currentTime", {
      get() {
        return (this as Record<string, unknown>)._currentTime || 0;
      },
      set(val) {
        (this as Record<string, unknown>)._currentTime = val;
        queueMicrotask(() => this.dispatchEvent(new Event("seeked")));
      },
    });

    await exportFrameByFrame(
      bridge,
      {} as HTMLCanvasElement,
      [0, 1000, 2000],
      (index: number, timeMs: number) => {
        capturedFrames.push(timeMs);
      },
    );

    expect(capturedFrames).toEqual([0, 1000, 2000]);
  });
});
