import type { AnimationOperation } from "@animator/core";
import {
  subscribeToOperations,
  useSceneGraphStore,
} from "./sceneGraphStore.js";

export interface SyncOptions {
  channelName?: string;
  webSocket?: WebSocket | null;
}

export class SyncMiddleware {
  private channel: BroadcastChannel | null = null;
  private ws: WebSocket | null = null;
  private unsubscribeStore: (() => void) | null = null;
  private channelName: string;

  constructor(options: SyncOptions = {}) {
    this.channelName = options.channelName || "animator-sync-channel";
    this.ws = options.webSocket || null;

    this.initBroadcastChannel();
    this.initWebSocket();
    this.subscribeLocalOperations();
  }

  private initBroadcastChannel(): void {
    if (typeof BroadcastChannel !== "undefined") {
      try {
        this.channel = new BroadcastChannel(this.channelName);
        this.channel.onmessage = (event: MessageEvent) => {
          this.handleIncomingMessage(event.data);
        };
      } catch (err) {
        console.warn("BroadcastChannel initialization failed:", err);
      }
    }
  }

  private initWebSocket(): void {
    if (this.ws) {
      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const data =
            typeof event.data === "string"
              ? JSON.parse(event.data)
              : event.data;
          this.handleIncomingMessage(data);
        } catch (err) {
          console.warn("Failed to parse WebSocket message:", err);
        }
      };
    }
  }

  public setWebSocket(ws: WebSocket | null): void {
    this.ws = ws;
    this.initWebSocket();
  }

  private subscribeLocalOperations(): void {
    this.unsubscribeStore = subscribeToOperations((op: AnimationOperation) => {
      // Do not broadcast remote-originated operations
      if (op.source === "remote") return;

      this.broadcast(op);
    });
  }

  public broadcast(op: AnimationOperation): void {
    const payload = JSON.stringify(op);

    // BroadcastChannel
    if (this.channel) {
      try {
        this.channel.postMessage(payload);
      } catch (err) {
        console.warn("Failed to post message to BroadcastChannel:", err);
      }
    }

    // WebSocket
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(payload);
      } catch (err) {
        console.warn("Failed to send message over WebSocket:", err);
      }
    }
  }

  private handleIncomingMessage(data: unknown): void {
    let op: AnimationOperation | null = null;

    if (typeof data === "string") {
      try {
        op = JSON.parse(data) as AnimationOperation;
      } catch {
        return;
      }
    } else if (data && typeof data === "object") {
      op = data as AnimationOperation;
    }

    if (op?.type) {
      // Apply through applyRemote so it updates store without re-broadcasting
      useSceneGraphStore.getState().applyRemote(op);
    }
  }

  public destroy(): void {
    if (this.unsubscribeStore) {
      this.unsubscribeStore();
      this.unsubscribeStore = null;
    }
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    if (this.ws) {
      this.ws.onmessage = null;
      this.ws = null;
    }
  }
}
