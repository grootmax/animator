import type { SceneNode } from "@animator/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearVideoElements,
  getExportMediaStream,
  getVideoElementForNode,
  registerVideoElement,
  setupExportAudioStream,
  syncVideoAssets,
} from "./videoSync.js";

class MockHTMLVideoElement {
  currentTime = 0;
  paused = false;
  muted = false;
  private listeners: Record<string, ((e?: Event) => void)[]> = {};

  pause() {
    this.paused = true;
  }

  play() {
    this.paused = false;
  }

  addEventListener(event: string, cb: (e?: Event) => void) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(cb);
  }

  removeEventListener(event: string, cb: (e?: Event) => void) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter((fn) => fn !== cb);
    }
  }

  trigger(event: string) {
    if (this.listeners[event]) {
      for (const cb of [...this.listeners[event]]) {
        cb();
      }
    }
  }
}

describe("videoSync", () => {
  beforeEach(() => {
    clearVideoElements();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should register and retrieve video elements", () => {
    const mockVideo = new MockHTMLVideoElement() as unknown as HTMLVideoElement;
    registerVideoElement("node1", mockVideo);

    expect(getVideoElementForNode("node1")).toBe(mockVideo);
    expect(getVideoElementForNode("unknown")).toBeUndefined();
  });

  it("should seek video elements accurately and enforce paused state", async () => {
    const mockVideo = new MockHTMLVideoElement();
    mockVideo.paused = false;
    registerVideoElement("vnode1", mockVideo as unknown as HTMLVideoElement);

    const nodeMap = new Map<string, SceneNode>([
      [
        "vnode1",
        {
          id: "vnode1",
          name: "Test Video",
          type: "video",
          x: 0,
          y: 0,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          opacity: 1,
          visible: true,
          locked: false,
          startTime: 1000,
          mediaOffset: 500,
          duration: 5000,
          volume: 0.8,
        },
      ],
    ]);

    const syncPromise = syncVideoAssets(2500, nodeMap);

    // video should be forced to pause during seek
    expect(mockVideo.paused).toBe(true);

    // clipTimeMs = (2500 - 1000) + 500 = 2000 ms -> 2.0 s
    expect(mockVideo.currentTime).toBe(2);

    // trigger DOM seeked event to resolve
    mockVideo.trigger("seeked");

    await syncPromise;
  });

  it("should handle 500ms fallback timeout if seeked event does not fire", async () => {
    const mockVideo = new MockHTMLVideoElement();
    registerVideoElement("vnode2", mockVideo as unknown as HTMLVideoElement);

    const syncPromise = syncVideoAssets(1000);

    // Do NOT trigger seeked event, wait for fallback timeout
    await expect(syncPromise).resolves.toBeUndefined();
  }, 1000);

  it("should setup WebAudio export stream and route gain properly", () => {
    const mockVideo = new MockHTMLVideoElement() as unknown as HTMLVideoElement;
    registerVideoElement("vnode3", mockVideo, {
      id: "vnode3",
      name: "Video Node",
      type: "video",
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      visible: true,
      locked: false,
      volume: 0.5,
      muted: false,
    });

    const mockGainNode = {
      gain: { value: 1 },
      connect: vi.fn(),
    };

    const mockSourceNode = {
      connect: vi.fn(),
    };

    const mockDestination = {
      stream: {
        getAudioTracks: () => [{ kind: "audio" }],
      },
    };

    const mockAudioContext = {
      createMediaStreamDestination: vi.fn().mockReturnValue(mockDestination),
      createMediaElementSource: vi.fn().mockReturnValue(mockSourceNode),
      createGain: vi.fn().mockReturnValue(mockGainNode),
    } as unknown as AudioContext;

    const destNode = setupExportAudioStream(mockAudioContext);

    expect(destNode).toBe(mockDestination);
    expect(mockAudioContext.createGain).toHaveBeenCalled();
    expect(mockGainNode.gain.value).toBe(0.5);
    expect(mockSourceNode.connect).toHaveBeenCalledWith(mockGainNode);
    expect(mockGainNode.connect).toHaveBeenCalledWith(mockDestination);
  });

  it("should merge canvas and audio stream in getExportMediaStream", () => {
    const mockCanvas = {
      captureStream: () => ({
        getVideoTracks: () => [{ kind: "video" }],
      }),
    } as unknown as HTMLCanvasElement;

    const stream = getExportMediaStream(mockCanvas);
    expect(stream).toBeDefined();
  });
});
