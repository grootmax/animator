import type {
  StoreSyncTarget,
  WebSocketSyncClient,
} from "./WebSocketSyncClient.js";
import type { SyncMessage } from "./sync.js";

export interface SyncMultiplexerOptions {
  channelName?: string;
  broadcastChannel?: BroadcastChannel;
  wsClient: WebSocketSyncClient;
  store: StoreSyncTarget;
}

export class SyncMultiplexer {
  private channel: BroadcastChannel | null = null;
  private wsClient: WebSocketSyncClient;
  private store: StoreSyncTarget;
  private tabId: string;

  constructor(options: SyncMultiplexerOptions) {
    this.wsClient = options.wsClient;
    this.store = options.store;
    this.tabId = Math.random().toString(36).substring(2, 9);

    if (options.broadcastChannel) {
      this.channel = options.broadcastChannel;
    } else if (typeof globalThis.BroadcastChannel !== "undefined") {
      const channelName = options.channelName || "animator-sync";
      this.channel = new globalThis.BroadcastChannel(channelName);
    }

    if (this.channel) {
      this.channel.onmessage = (event: MessageEvent) => {
        const data = event.data;
        if (
          data &&
          typeof data === "object" &&
          data._senderTabId !== this.tabId &&
          data.msg
        ) {
          this.store.applyRemote(data.msg);
        }
      };
    }

    this.wsClient.onMessage((msg: SyncMessage) => {
      if (this.channel) {
        this.channel.postMessage({ _senderTabId: this.tabId, msg });
      }
    });

    this.wsClient.setStore(this.store);
  }

  public handleLocalMutation(msg: SyncMessage): void {
    if (this.channel) {
      this.channel.postMessage({ _senderTabId: this.tabId, msg });
    }
    this.wsClient.send(msg);
  }

  public close(): void {
    if (this.channel) {
      this.channel.onmessage = null;
      this.channel.close();
      this.channel = null;
    }
  }
}
