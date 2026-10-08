import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSceneGraphStore } from "./sceneGraphStore.js";
import { SyncMiddleware } from "./syncMiddleware.js";

describe("SyncMiddleware", () => {
  beforeEach(() => {
    useSceneGraphStore.setState({
      document: {
        version: 1,
        name: "Sync Doc",
        canvas: { width: 1080, height: 1080, fps: 60, duration: 4 },
        layers: [
          {
            id: "layer-1",
            name: "Layer 1",
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

  it("sends local operation through WebSocket and BroadcastChannel", () => {
    const mockWs = {
      readyState: 1, // OPEN
      send: vi.fn(),
      onmessage: null,
    } as unknown as WebSocket;

    const middleware = new SyncMiddleware({ webSocket: mockWs });

    useSceneGraphStore
      .getState()
      .updateKeyframeTime("layer-1", "position", 1, 1.8);

    expect(mockWs.send).toHaveBeenCalledWith(
      expect.stringContaining('"type":"updateKeyframeTime"'),
    );

    middleware.destroy();
  });

  it("applies incoming WebSocket message via applyRemote", () => {
    let wsOnMessageListener: ((e: MessageEvent) => void) | undefined;

    const mockWs = {
      readyState: 1,
      send: vi.fn(),
      set onmessage(fn: ((e: MessageEvent) => void) | undefined) {
        wsOnMessageListener = fn;
      },
      get onmessage() {
        return wsOnMessageListener;
      },
    } as unknown as WebSocket;

    const middleware = new SyncMiddleware({ webSocket: mockWs });

    const incomingOp = {
      type: "updateLayerDuration",
      layerId: "layer-1",
      duration: { inTime: 0.5, outTime: 3.5 },
    };

    if (wsOnMessageListener) {
      wsOnMessageListener({
        data: JSON.stringify(incomingOp),
      } as MessageEvent);
    }

    const doc = useSceneGraphStore.getState().document;
    expect(doc.layers[0]?.in).toBe(0.5);
    expect(doc.layers[0]?.out).toBe(3.5);

    middleware.destroy();
  });
});
