// @vitest-environment happy-dom
import {
  AnimationEngine,
  type AnimationEvent,
  AnimationEventBus,
} from "@animator/core";
import React from "react";
import { createRoot } from "react-dom/client";
import { expect, test } from "vitest";
import { Timeline } from "./Timeline.js";

// Helper for flush microtasks / DOM updates
const act = async (fn: () => void | Promise<void>) => {
  await fn();
  await new Promise((resolve) => setTimeout(resolve, 50));
};

test("Timeline renders keyframe diamonds and triggers ANIMATION_RETIME drag events", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const bus = new AnimationEventBus("bus-a");
  const engine = new AnimationEngine(bus);
  engine.setTrack("layer-1", "position", [
    { t: 0, v: 0 },
    { t: 2.0, v: 100 },
  ]);

  const receivedEvents: AnimationEvent[] = [];
  bus.subscribe((evt) => receivedEvents.push(evt));

  await act(() => {
    root.render(<Timeline eventBus={bus} engine={engine} />);
  });

  const kfDiamond = container.querySelector(
    '[data-testid="keyframe-diamond-layer-1-1"]',
  ) as HTMLElement;
  expect(kfDiamond).not.toBeNull();

  // Simulate drag: pointerDown at x=100, pointerMove at x=150 (delta +50px = +1s), pointerUp
  const pointerDown = new PointerEvent("pointerdown", {
    bubbles: true,
    clientX: 100,
  });
  const pointerMove = new PointerEvent("pointermove", {
    bubbles: true,
    clientX: 150,
  });
  const pointerUp = new PointerEvent("pointerup", {
    bubbles: true,
    clientX: 150,
  });

  await act(() => {
    kfDiamond.dispatchEvent(pointerDown);
    container
      .querySelector('[data-testid="timeline"]')
      ?.dispatchEvent(pointerMove);
    container
      .querySelector('[data-testid="timeline"]')
      ?.dispatchEvent(pointerUp);
  });

  expect(receivedEvents.length).toBeGreaterThan(0);
  const retimeEvt = receivedEvents.find((e) => e.type === "ANIMATION_RETIME");
  expect(retimeEvt).toBeDefined();
  if (retimeEvt && retimeEvt.type === "ANIMATION_RETIME") {
    expect(retimeEvt.layerId).toBe("layer-1");
    expect(retimeEvt.newTime).toBe(3.0); // 2.0s + (50px / 50px/s) = 3.0s
  }

  const updatedTrack = engine.getTrack("layer-1", "position");
  expect(updatedTrack?.keyframes[1]?.t).toBe(3.0);

  root.unmount();
  container.remove();
});

test("Timeline layer in/out duration handles trim layer bounds via LAYER_TRIM events", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const bus = new AnimationEventBus("bus-trim");
  const engine = new AnimationEngine(bus);
  engine.setLayerTrim("layer-1", 0, 10);

  const receivedEvents: AnimationEvent[] = [];
  bus.subscribe((evt) => receivedEvents.push(evt));

  await act(() => {
    root.render(<Timeline eventBus={bus} engine={engine} />);
  });

  const trimInHandle = container.querySelector(
    '[data-testid="trim-handle-in-layer-1"]',
  ) as HTMLElement;
  expect(trimInHandle).not.toBeNull();

  // Drag trim in handle: pointerDown x=0, move x=50 (+1s)
  await act(() => {
    trimInHandle.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, clientX: 0 }),
    );
    container
      .querySelector('[data-testid="timeline"]')
      ?.dispatchEvent(
        new PointerEvent("pointermove", { bubbles: true, clientX: 50 }),
      );
    container
      .querySelector('[data-testid="timeline"]')
      ?.dispatchEvent(
        new PointerEvent("pointerup", { bubbles: true, clientX: 50 }),
      );
  });

  const trimEvt = receivedEvents.find((e) => e.type === "LAYER_TRIM");
  expect(trimEvt).toBeDefined();
  if (trimEvt && trimEvt.type === "LAYER_TRIM") {
    expect(trimEvt.trimIn).toBe(1.0);
  }

  const trim = engine.getLayerTrim("layer-1");
  expect(trim.trimIn).toBe(1.0);

  root.unmount();
  container.remove();
});

test("Connected editor instances sync keyframes and trims across BroadcastChannel", async () => {
  // Polyfill BroadcastChannel if not available in environment
  class MockBroadcastChannel {
    name: string;
    static channels = new Map<string, Set<MockBroadcastChannel>>();
    onmessage: ((e: MessageEvent) => void) | null = null;

    constructor(name: string) {
      this.name = name;
      if (!MockBroadcastChannel.channels.has(name)) {
        MockBroadcastChannel.channels.set(name, new Set());
      }
      MockBroadcastChannel.channels.get(name)?.add(this);
    }

    postMessage(data: AnimationEvent) {
      const set = MockBroadcastChannel.channels.get(this.name);
      if (set) {
        for (const ch of Array.from(set)) {
          if (ch !== this && ch.onmessage) {
            ch.onmessage(new MessageEvent("message", { data }));
          }
        }
      }
    }

    close() {
      MockBroadcastChannel.channels.get(this.name)?.delete(this);
    }
  }

  const OriginalBC = globalThis.BroadcastChannel;
  if (typeof globalThis.BroadcastChannel === "undefined") {
    Object.defineProperty(globalThis, "BroadcastChannel", {
      value: MockBroadcastChannel,
      writable: true,
    });
  }

  try {
    const bus1 = new AnimationEventBus("peer-1");
    const engine1 = new AnimationEngine(bus1);

    const bus2 = new AnimationEventBus("peer-2");
    const engine2 = new AnimationEngine(bus2);

    // Setup network relay channel 1
    const channel1 = new BroadcastChannel("test-peer-sync");
    bus1.subscribe((evt) => {
      if (evt.senderId === bus1.id) channel1.postMessage(evt);
    });
    channel1.onmessage = (e) => {
      if (e.data?.senderId !== bus1.id) bus1.receive(e.data);
    };

    // Setup network relay channel 2
    const channel2 = new BroadcastChannel("test-peer-sync");
    bus2.subscribe((evt) => {
      if (evt.senderId === bus2.id) channel2.postMessage(evt);
    });
    channel2.onmessage = (e) => {
      if (e.data?.senderId !== bus2.id) bus2.receive(e.data);
    };

    // Initialize track on engine1 and engine2
    engine1.setTrack("layer-sync", "position", [
      { t: 0, v: 0 },
      { t: 1.0, v: 50 },
    ]);
    engine2.setTrack("layer-sync", "position", [
      { t: 0, v: 0 },
      { t: 1.0, v: 50 },
    ]);

    // Peer 1 retimes keyframe 1 to t = 2.5
    bus1.publish({
      type: "ANIMATION_RETIME",
      layerId: "layer-sync",
      prop: "position",
      keyframeIndex: 1,
      newTime: 2.5,
      sequenceId: 12345,
    });

    await new Promise((res) => setTimeout(res, 20));

    // Verify Peer 2 engine updated keyframe to 2.5
    const peer2Track = engine2.getTrack("layer-sync", "position");
    expect(peer2Track?.keyframes[1]?.t).toBe(2.5);

    channel1.close();
    channel2.close();
  } finally {
    if (OriginalBC) {
      Object.defineProperty(globalThis, "BroadcastChannel", {
        value: OriginalBC,
        writable: true,
      });
    }
  }
});
