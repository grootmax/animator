// @vitest-environment happy-dom
import { type SyncMessage, createSceneGraphStore } from "@monorepo/scene-graph";
import { render } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  readyState = 0; // CONNECTING
  onopen: (() => void) | null = null;
  onmessage: ((evt: { data: string }) => void) | null = null;
  onerror: ((evt: Event) => void) | null = null;
  onclose: (() => void) | null = null;
  sentMessages: string[] = [];

  static OPEN = 1;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error("WebSocket is not open");
    }
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = 3; // CLOSED
    if (this.onclose) this.onclose();
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) this.onopen();
  }

  receive(data: unknown) {
    if (this.onmessage) {
      this.onmessage({
        data: typeof data === "string" ? data : JSON.stringify(data),
      });
    }
  }

  triggerError(err: Event) {
    if (this.onerror) this.onerror(err);
  }
}

describe("App - WebSocket transport adapter", () => {
  let originalWebSocket: typeof WebSocket;

  beforeEach(() => {
    MockWebSocket.instances = [];
    originalWebSocket = global.WebSocket;
    (global as unknown as { WebSocket: typeof MockWebSocket }).WebSocket =
      MockWebSocket;
    (global as unknown as { WebSocket: { OPEN: number } }).WebSocket.OPEN = 1;
  });

  afterEach(() => {
    (global as unknown as { WebSocket: typeof WebSocket }).WebSocket =
      originalWebSocket;
    vi.restoreAllMocks();
  });

  it("initializes a WebSocket instance upon launch", () => {
    render(<App wsUrl="ws://localhost:4747/ws" />);
    expect(MockWebSocket.instances.length).toBe(1);
    expect(MockWebSocket.instances[0]?.url).toBe("ws://localhost:4747/ws");
  });

  it("dispatches outbound mutations via ws.send() when socket state is OPEN", () => {
    let capturedBroadcastCb: ((msg: SyncMessage) => void) | null = null;
    const store = createSceneGraphStore((msg) => {
      if (capturedBroadcastCb) capturedBroadcastCb(msg);
    });

    const mockWs = new MockWebSocket("ws://localhost:4747/ws");
    mockWs.open();

    capturedBroadcastCb = (msg) => {
      if (mockWs.readyState === MockWebSocket.OPEN) {
        mockWs.send(JSON.stringify(msg));
      }
    };

    store.getState().addNode({ id: "node1", type: "rect" });

    expect(mockWs.sentMessages.length).toBe(1);
    const firstMsg = mockWs.sentMessages[0];
    expect(firstMsg).toBeDefined();
    if (firstMsg) {
      expect(JSON.parse(firstMsg)).toEqual({
        type: "addNode",
        payload: { id: "node1", type: "rect" },
      });
    }
  });

  it("executes store.applyRemote() on inbound socket messages", () => {
    const store = createSceneGraphStore();
    const spyApplyRemote = vi.spyOn(store, "applyRemote");

    const mockWs = new MockWebSocket("ws://localhost:4747/ws");
    mockWs.open();

    const inboundMessage: SyncMessage = {
      type: "updateNode",
      payload: { id: "node1", updates: { x: 100 } },
    };

    mockWs.onmessage = (event) => {
      const parsed = JSON.parse(event.data) as SyncMessage;
      store.applyRemote?.(parsed);
    };

    mockWs.receive(inboundMessage);

    expect(spyApplyRemote).toHaveBeenCalledWith(inboundMessage);
  });

  it("catches socket errors and connection failures gracefully", () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const FaultyWebSocket = vi.fn().mockImplementation(() => {
      throw new Error("Network connection failed");
    });
    (global as unknown as { WebSocket: typeof FaultyWebSocket }).WebSocket =
      FaultyWebSocket;

    expect(() => {
      render(<App wsUrl="ws://invalid:9999" />);
    }).not.toThrow();

    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
