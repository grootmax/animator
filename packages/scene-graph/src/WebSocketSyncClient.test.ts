import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ConnectionState,
  WebSocketSyncClient,
} from "./WebSocketSyncClient.js";
import { SyncMultiplexer } from "./multiplexer.js";
import { createSceneGraphStore } from "./store.js";
import type { SyncMessage } from "./sync.js";

class MockWebSocket {
  public static instances: MockWebSocket[] = [];
  public url: string;
  public readyState = 0; // 0: CONNECTING, 1: OPEN, 2: CLOSING, 3: CLOSED

  public onopen: (() => void) | null = null;
  public onmessage: ((event: { data: unknown }) => void) | null = null;
  public onerror: ((event: unknown) => void) | null = null;
  public onclose: (() => void) | null = null;

  public sentMessages: string[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  public simulateOpen() {
    this.readyState = 1;
    if (this.onopen) this.onopen();
  }

  public simulateMessage(data: string) {
    if (this.onmessage) this.onmessage({ data });
  }

  public simulateError(err: unknown = new Error("Socket error")) {
    if (this.onerror) this.onerror(err);
  }

  public simulateClose() {
    this.readyState = 3;
    if (this.onclose) this.onclose();
  }

  public send(data: string) {
    if (this.readyState !== 1) {
      throw new Error("WebSocket is not open");
    }
    this.sentMessages.push(data);
  }

  public close() {
    this.readyState = 3;
    if (this.onclose) this.onclose();
  }
}

describe("WebSocketSyncClient", () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("connects to target URL and transitions states correctly", () => {
    const states: ConnectionState[] = [];
    const client = new WebSocketSyncClient({
      url: "ws://localhost:8080/sync",
      WebSocketClass: MockWebSocket as unknown as typeof WebSocket,
      onStateChange: (state) => states.push(state),
    });

    expect(client.getState()).toBe("DISCONNECTED");

    client.connect();
    expect(client.getState()).toBe("CONNECTING");

    const ws = MockWebSocket.instances[0];
    expect(ws).toBeDefined();
    expect(ws?.url).toBe("ws://localhost:8080/sync");

    ws?.simulateOpen();
    expect(client.getState()).toBe("CONNECTED");

    client.disconnect();
    expect(client.getState()).toBe("DISCONNECTED");
    expect(states).toEqual([
      "DISCONNECTED",
      "CONNECTING",
      "CONNECTED",
      "DISCONNECTED",
    ]);
  });

  it("triggers broadcastCb and publishes JSON-encoded SyncMessage objects over socket", () => {
    const client = new WebSocketSyncClient({
      url: "ws://localhost:8080/sync",
      WebSocketClass: MockWebSocket as unknown as typeof WebSocket,
    });

    const store = createSceneGraphStore((msg) => client.send(msg));
    client.setStore(store);

    client.connect();
    const ws = MockWebSocket.instances[0];
    ws?.simulateOpen();

    store.getState().addNode({ id: "rect1", type: "rect", x: 10, y: 20 });

    expect(ws?.sentMessages.length).toBe(1);
    const sentMsg = ws?.sentMessages[0];
    expect(sentMsg).toBeDefined();
    const sent = JSON.parse(sentMsg || "{}");
    expect(sent.type).toBe("addNode");
    expect(sent.payload.id).toBe("rect1");
  });

  it("executes store.applyRemote(msg) on received WebSocket messages", () => {
    const client = new WebSocketSyncClient({
      url: "ws://localhost:8080/sync",
      WebSocketClass: MockWebSocket as unknown as typeof WebSocket,
    });

    const store = createSceneGraphStore((msg) => client.send(msg));
    client.setStore(store);

    client.connect();
    const ws = MockWebSocket.instances[0];
    ws?.simulateOpen();

    const inboundMsg: SyncMessage = {
      type: "addNode",
      payload: { id: "agent-circle", type: "circle", x: 100, y: 100 },
    };
    ws?.simulateMessage(JSON.stringify(inboundMsg));

    const nodes = store.getState().nodes;
    expect(nodes["agent-circle"]).toBeDefined();
    expect(nodes["agent-circle"]?.type).toBe("circle");

    expect(ws?.sentMessages.length).toBe(0);
  });

  it("buffers outbound messages while offline and flushes in sequence on reconnect", () => {
    const client = new WebSocketSyncClient({
      url: "ws://localhost:8080/sync",
      WebSocketClass: MockWebSocket as unknown as typeof WebSocket,
      initialReconnectDelay: 100,
    });

    const store = createSceneGraphStore((msg) => client.send(msg));
    client.setStore(store);

    store.getState().addNode({ id: "node1", type: "rect" });
    store.getState().addNode({ id: "node2", type: "circle" });

    expect(client.getQueueSize()).toBe(2);

    client.connect();
    const ws = MockWebSocket.instances[0];
    expect(ws?.sentMessages.length).toBe(0);

    ws?.simulateOpen();

    expect(ws?.sentMessages.length).toBe(2);
    const msg0 = ws?.sentMessages[0];
    const msg1 = ws?.sentMessages[1];
    expect(JSON.parse(msg0 || "{}").payload.id).toBe("node1");
    expect(JSON.parse(msg1 || "{}").payload.id).toBe("node2");
    expect(client.getQueueSize()).toBe(0);
  });

  it("caps offline queue capacity at 1,000 messages (Guardrail 3)", () => {
    const client = new WebSocketSyncClient({
      url: "ws://localhost:8080/sync",
      WebSocketClass: MockWebSocket as unknown as typeof WebSocket,
      maxQueueSize: 1000,
    });

    for (let i = 0; i < 1200; i++) {
      client.send({
        type: "updateNode",
        payload: { id: "node1", updates: { x: i } },
      });
    }

    expect(client.getQueueSize()).toBe(1000);
    const queue = client.getQueue();
    expect(queue[0]?.payload.updates.x).toBe(200);
    expect(queue[999]?.payload.updates.x).toBe(1199);
  });

  it("performs automatic exponential backoff reconnects on socket disconnect", () => {
    const states: ConnectionState[] = [];
    const client = new WebSocketSyncClient({
      url: "ws://localhost:8080/sync",
      WebSocketClass: MockWebSocket as unknown as typeof WebSocket,
      initialReconnectDelay: 100,
      reconnectBackoffFactor: 2,
      maxReconnectDelay: 1000,
      onStateChange: (state) => states.push(state),
    });

    client.connect();
    let ws = MockWebSocket.instances[0];
    ws?.simulateOpen();
    expect(client.getState()).toBe("CONNECTED");

    ws?.simulateClose();
    expect(client.getState()).toBe("RECONNECTING");

    vi.advanceTimersByTime(100);
    expect(MockWebSocket.instances.length).toBe(2);
    ws = MockWebSocket.instances[1];

    ws?.simulateClose();
    expect(client.getState()).toBe("RECONNECTING");

    vi.advanceTimersByTime(200);
    expect(MockWebSocket.instances.length).toBe(3);
    ws = MockWebSocket.instances[2];

    ws?.simulateOpen();
    expect(client.getState()).toBe("CONNECTED");
  });

  it("handles invalid JSON gracefully without throwing", () => {
    const client = new WebSocketSyncClient({
      url: "ws://localhost:8080/sync",
      WebSocketClass: MockWebSocket as unknown as typeof WebSocket,
    });

    client.connect();
    const ws = MockWebSocket.instances[0];
    ws?.simulateOpen();

    expect(() => {
      ws?.simulateMessage("invalid json string {");
      ws?.simulateMessage(JSON.stringify({ notASyncMsg: true }));
    }).not.toThrow();
  });

  it("multiplexes BroadcastChannel and WebSocketSyncClient across tabs without duplication", () => {
    class MockBroadcastChannel {
      public static channels: Map<string, MockBroadcastChannel[]> = new Map();
      public name: string;
      public onmessage: ((event: { data: unknown }) => void) | null = null;

      constructor(name: string) {
        this.name = name;
        if (!MockBroadcastChannel.channels.has(name)) {
          MockBroadcastChannel.channels.set(name, []);
        }
        MockBroadcastChannel.channels.get(name)?.push(this);
      }

      public postMessage(data: unknown) {
        const peers = MockBroadcastChannel.channels.get(this.name) || [];
        for (const peer of peers) {
          if (peer !== this && peer.onmessage) {
            peer.onmessage({ data });
          }
        }
      }

      public close() {
        const peers = MockBroadcastChannel.channels.get(this.name) || [];
        const idx = peers.indexOf(this);
        if (idx !== -1) peers.splice(idx, 1);
      }
    }

    const wsClientTabA = new WebSocketSyncClient({
      url: "ws://localhost:8080/sync",
      WebSocketClass: MockWebSocket as unknown as typeof WebSocket,
    });
    const wsClientTabB = new WebSocketSyncClient({
      url: "ws://localhost:8080/sync",
      WebSocketClass: MockWebSocket as unknown as typeof WebSocket,
    });

    const storeA = createSceneGraphStore((msg) =>
      muxA.handleLocalMutation(msg),
    );
    const storeB = createSceneGraphStore((msg) =>
      muxB.handleLocalMutation(msg),
    );

    const channelA = new MockBroadcastChannel("test-sync");
    const channelB = new MockBroadcastChannel("test-sync");

    const muxA = new SyncMultiplexer({
      broadcastChannel: channelA as unknown as BroadcastChannel,
      wsClient: wsClientTabA,
      store: storeA,
    });

    const muxB = new SyncMultiplexer({
      broadcastChannel: channelB as unknown as BroadcastChannel,
      wsClient: wsClientTabB,
      store: storeB,
    });

    wsClientTabA.connect();
    wsClientTabB.connect();

    const wsA = MockWebSocket.instances[0];
    const wsB = MockWebSocket.instances[1];
    wsA?.simulateOpen();
    wsB?.simulateOpen();

    storeA.getState().addNode({ id: "tabA-rect", type: "rect" });

    expect(storeB.getState().nodes["tabA-rect"]).toBeDefined();
    expect(wsA?.sentMessages.length).toBe(1);
    expect(wsB?.sentMessages.length).toBe(0);

    muxA.close();
    muxB.close();
  });
});
