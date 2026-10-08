import type { SyncMessage } from "./sync.js";

export type ConnectionState =
  | "CONNECTING"
  | "CONNECTED"
  | "DISCONNECTED"
  | "RECONNECTING";

export interface StoreSyncTarget {
  applyRemote: (msg: SyncMessage) => void;
}

export interface WebSocketSyncClientOptions {
  url?: string;
  WebSocketClass?: typeof WebSocket;
  maxQueueSize?: number;
  initialReconnectDelay?: number;
  maxReconnectDelay?: number;
  reconnectBackoffFactor?: number;
  autoReconnect?: boolean;
  onStateChange?: (state: ConnectionState) => void;
  onMessage?: (msg: SyncMessage) => void;
  store?: StoreSyncTarget;
}

export class WebSocketSyncClient {
  private state: ConnectionState = "DISCONNECTED";
  private url: string | null = null;
  private ws: WebSocket | null = null;
  private queue: SyncMessage[] = [];
  private maxQueueSize = 1000;
  private initialReconnectDelay = 100;
  private maxReconnectDelay = 5000;
  private reconnectBackoffFactor = 2;
  private autoReconnect = true;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isIntentionallyClosed = false;

  private WebSocketClass: typeof WebSocket;
  private store: StoreSyncTarget | null = null;

  private stateSubscribers: Set<(state: ConnectionState) => void> = new Set();
  private messageSubscribers: Set<(msg: SyncMessage) => void> = new Set();

  constructor(options: WebSocketSyncClientOptions = {}) {
    if (options.url) {
      this.url = options.url;
    }
    if (options.WebSocketClass) {
      this.WebSocketClass = options.WebSocketClass;
    } else if (typeof globalThis.WebSocket !== "undefined") {
      this.WebSocketClass = globalThis.WebSocket;
    } else {
      this.WebSocketClass = class {} as unknown as typeof WebSocket;
    }

    if (options.maxQueueSize !== undefined) {
      this.maxQueueSize = options.maxQueueSize;
    }
    if (options.initialReconnectDelay !== undefined) {
      this.initialReconnectDelay = options.initialReconnectDelay;
    }
    if (options.maxReconnectDelay !== undefined) {
      this.maxReconnectDelay = options.maxReconnectDelay;
    }
    if (options.reconnectBackoffFactor !== undefined) {
      this.reconnectBackoffFactor = options.reconnectBackoffFactor;
    }
    if (options.autoReconnect !== undefined) {
      this.autoReconnect = options.autoReconnect;
    }
    if (options.onStateChange) {
      this.subscribeState(options.onStateChange);
    }
    if (options.onMessage) {
      this.onMessage(options.onMessage);
    }
    if (options.store) {
      this.store = options.store;
    }
  }

  public getState(): ConnectionState {
    return this.state;
  }

  public getQueue(): SyncMessage[] {
    return [...this.queue];
  }

  public getQueueSize(): number {
    return this.queue.length;
  }

  public clearQueue(): void {
    this.queue = [];
  }

  public setStore(store: StoreSyncTarget | null): void {
    this.store = store;
  }

  public subscribeState(
    callback: (state: ConnectionState) => void,
  ): () => void {
    this.stateSubscribers.add(callback);
    callback(this.state);
    return () => {
      this.stateSubscribers.delete(callback);
    };
  }

  public onStateChange(callback: (state: ConnectionState) => void): () => void {
    return this.subscribeState(callback);
  }

  public onMessage(callback: (msg: SyncMessage) => void): () => void {
    this.messageSubscribers.add(callback);
    return () => {
      this.messageSubscribers.delete(callback);
    };
  }

  public connect(targetUrl?: string): void {
    if (targetUrl) {
      this.url = targetUrl;
    }
    if (!this.url) {
      throw new Error("WebSocketSyncClient: No connection URL specified");
    }

    this.clearReconnectTimer();
    this.isIntentionallyClosed = false;

    if (this.ws) {
      if (
        this.ws.readyState === 0 /* CONNECTING */ ||
        this.ws.readyState === 1 /* OPEN */
      ) {
        return;
      }
      this.cleanupSocket();
    }

    const nextState: ConnectionState =
      this.reconnectAttempts > 0 ? "RECONNECTING" : "CONNECTING";
    this.setState(nextState);

    try {
      this.ws = new this.WebSocketClass(this.url);
    } catch {
      this.handleDisconnectOrError();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.setState("CONNECTED");
      this.flushQueue();
    };

    this.ws.onmessage = (event: MessageEvent | { data: unknown }) => {
      try {
        const rawData =
          typeof event.data === "string" ? event.data : String(event.data);
        const msg = JSON.parse(rawData) as SyncMessage;
        if (msg && typeof msg === "object" && typeof msg.type === "string") {
          for (const sub of this.messageSubscribers) {
            sub(msg);
          }
          if (this.store) {
            this.store.applyRemote(msg);
          }
        }
      } catch {
        // Parse error or invalid message payload - ignore safely
      }
    };

    this.ws.onerror = () => {
      // Error callback - socket close will trigger reconnection logic
    };

    this.ws.onclose = () => {
      this.handleSocketClose();
    };
  }

  public disconnect(): void {
    this.isIntentionallyClosed = true;
    this.clearReconnectTimer();
    if (this.ws) {
      this.cleanupSocket();
    }
    this.setState("DISCONNECTED");
  }

  public send(msg: SyncMessage): void {
    if (
      this.state === "CONNECTED" &&
      this.ws &&
      this.ws.readyState === 1 /* OPEN */
    ) {
      try {
        this.ws.send(JSON.stringify(msg));
        return;
      } catch {
        // Send failed, fall through to buffer item
      }
    }

    this.enqueueMessage(msg);
  }

  public broadcast(msg: SyncMessage): void {
    this.send(msg);
  }

  private enqueueMessage(msg: SyncMessage): void {
    this.queue.push(msg);
    if (this.queue.length > this.maxQueueSize) {
      this.queue.shift(); // Cap capacity at maxQueueSize (1000)
    }
  }

  private flushQueue(): void {
    while (
      this.queue.length > 0 &&
      this.state === "CONNECTED" &&
      this.ws &&
      this.ws.readyState === 1
    ) {
      const msg = this.queue.shift();
      if (msg) {
        try {
          this.ws.send(JSON.stringify(msg));
        } catch {
          // Re-enqueue if send fails during flush
          this.queue.unshift(msg);
          break;
        }
      }
    }
  }

  private handleSocketClose(): void {
    this.cleanupSocket();

    if (this.isIntentionallyClosed) {
      this.setState("DISCONNECTED");
      return;
    }

    if (this.autoReconnect) {
      this.setState("RECONNECTING");
      this.scheduleReconnect();
    } else {
      this.setState("DISCONNECTED");
    }
  }

  private handleDisconnectOrError(): void {
    this.cleanupSocket();
    if (this.autoReconnect && !this.isIntentionallyClosed) {
      this.setState("RECONNECTING");
      this.scheduleReconnect();
    } else {
      this.setState("DISCONNECTED");
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    const delay = Math.min(
      this.maxReconnectDelay,
      this.initialReconnectDelay *
        this.reconnectBackoffFactor ** this.reconnectAttempts,
    );
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      if (!this.isIntentionallyClosed) {
        this.connect();
      }
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private cleanupSocket(): void {
    if (this.ws) {
      this.ws.onopen = null as unknown as () => void;
      this.ws.onmessage = null as unknown as (event: MessageEvent) => void;
      this.ws.onerror = null as unknown as (event: Event) => void;
      this.ws.onclose = null as unknown as (event: CloseEvent) => void;
      try {
        if (this.ws.readyState === 0 || this.ws.readyState === 1) {
          this.ws.close();
        }
      } catch {
        // ignore close errors
      }
      this.ws = null;
    }
  }

  private setState(newState: ConnectionState): void {
    if (this.state === newState) return;
    this.state = newState;
    for (const sub of this.stateSubscribers) {
      sub(newState);
    }
  }
}
