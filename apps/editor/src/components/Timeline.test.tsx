// @vitest-environment happy-dom
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it } from "vitest";
import { useSceneGraphStore } from "../store/sceneGraphStore.js";
import { Timeline } from "./Timeline.js";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// Mock PointerEvent if not fully implemented in happy-dom
if (typeof PointerEvent === "undefined") {
  (globalThis as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent =
    class extends MouseEvent {
      pointerId = 1;
      constructor(type: string, params: MouseEventInit = {}) {
        super(type, params);
        this.pointerId = 1;
      }
    } as unknown as typeof MouseEvent;
}

// Mock setPointerCapture / releasePointerCapture on Element prototype if missing
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}

describe("Timeline component", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);

    useSceneGraphStore.setState({
      document: {
        version: 1,
        name: "Timeline Test Doc",
        canvas: { width: 1080, height: 1080, fps: 60, duration: 4 },
        layers: [
          {
            id: "layer-1",
            name: "Test Layer",
            type: "shape",
            in: 0,
            out: 4,
            tracks: {
              position: {
                prop: "position",
                keyframes: [
                  { t: 0, v: [0, 0] },
                  { t: 2, v: [100, 100] },
                ],
              },
            },
          },
        ],
      },
      playheadTime: 0,
      selectedLayerId: "layer-1",
    });
  });

  it("renders keyframes and layer duration bar", () => {
    act(() => {
      createRoot(container).render(<Timeline pxPerSecond={100} />);
    });

    const keyframeEl = container.querySelector(
      '[data-testid="keyframe-layer-1-position-1"]',
    );
    expect(keyframeEl).not.toBeNull();

    const layerBar = container.querySelector(
      '[data-testid="layer-bar-layer-1"]',
    );
    expect(layerBar).not.toBeNull();
  });

  it("handles pointer drag on keyframe diamond and updates keyframe time aligned to 16.67ms frame interval", () => {
    act(() => {
      createRoot(container).render(<Timeline pxPerSecond={100} />);
    });

    const keyframeEl = container.querySelector(
      '[data-testid="keyframe-layer-1-position-1"]',
    ) as HTMLDivElement;
    expect(keyframeEl).not.toBeNull();

    // Keyframe initial time t = 2.0s (x = 200px at 100px/s)
    // PointerDown at clientX = 200
    act(() => {
      keyframeEl.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          clientX: 200,
          pointerId: 1,
        }),
      );
    });

    const timelineContainer = container.querySelector(
      '[data-testid="timeline"]',
    ) as HTMLDivElement;

    // Drag right by 50px (0.5 seconds delta => 2.5s)
    act(() => {
      timelineContainer.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          clientX: 250,
          pointerId: 1,
        }),
      );
    });

    // Check playhead preview updated in real time
    expect(useSceneGraphStore.getState().playheadTime).toBe(2.5);

    // PointerUp to finish drag
    act(() => {
      timelineContainer.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          clientX: 250,
          pointerId: 1,
        }),
      );
    });

    const doc = useSceneGraphStore.getState().document;
    const keyframes = doc.layers[0]?.tracks.position?.keyframes;
    expect(keyframes?.[1]?.t).toBe(2.5);
  });

  it("handles pointer drag on layer duration in-handle and out-handle", () => {
    act(() => {
      createRoot(container).render(<Timeline pxPerSecond={100} />);
    });

    const inHandle = container.querySelector(
      '[data-testid="layer-in-handle-layer-1"]',
    ) as HTMLDivElement;
    const outHandle = container.querySelector(
      '[data-testid="layer-out-handle-layer-1"]',
    ) as HTMLDivElement;
    const timelineContainer = container.querySelector(
      '[data-testid="timeline"]',
    ) as HTMLDivElement;

    // Drag layer in-handle from 0.0s to 1.0s (delta +100px)
    act(() => {
      inHandle.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          clientX: 0,
          pointerId: 1,
        }),
      );
    });

    act(() => {
      timelineContainer.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          clientX: 100,
          pointerId: 1,
        }),
      );
    });

    act(() => {
      timelineContainer.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          clientX: 100,
          pointerId: 1,
        }),
      );
    });

    let doc = useSceneGraphStore.getState().document;
    expect(doc.layers[0]?.in).toBe(1.0);

    // Drag layer out-handle from 4.0s (400px) to 3.0s (300px, delta -100px)
    act(() => {
      outHandle.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          clientX: 400,
          pointerId: 1,
        }),
      );
    });

    act(() => {
      timelineContainer.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          clientX: 300,
          pointerId: 1,
        }),
      );
    });

    act(() => {
      timelineContainer.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          clientX: 300,
          pointerId: 1,
        }),
      );
    });

    doc = useSceneGraphStore.getState().document;
    expect(doc.layers[0]?.out).toBe(3.0);
  });
});
