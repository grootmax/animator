import {
  type SceneGraphStore,
  type SyncMessage,
  createSceneGraphStore,
} from "@monorepo/scene-graph";
import React, { useEffect, useRef, useState } from "react";

export interface AppProps {
  wsUrl?: string;
}

export function App({ wsUrl }: AppProps = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const storeRef = useRef<SceneGraphStore | null>(null);

  if (!storeRef.current) {
    storeRef.current = createSceneGraphStore((msg: SyncMessage) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify(msg));
        } catch (err) {
          console.error("Failed to send SyncMessage over WebSocket:", err);
        }
      }
    });
  }

  const store = storeRef.current;

  useEffect(() => {
    const endpoint =
      wsUrl ||
      (typeof process !== "undefined" && process.env?.VITE_STUDIO_WS_URL) ||
      "ws://localhost:4747/ws";

    let ws: WebSocket;

    try {
      ws = new WebSocket(endpoint);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          const parsedMessage = JSON.parse(event.data) as SyncMessage;
          if (
            parsedMessage &&
            typeof parsedMessage === "object" &&
            parsedMessage.type
          ) {
            if (store && typeof store.applyRemote === "function") {
              store.applyRemote(parsedMessage);
            }
          }
        } catch (err) {
          console.error("Failed to parse inbound WebSocket SyncMessage:", err);
        }
      };

      ws.onerror = (evt) => {
        console.error("WebSocket transport error:", evt);
        setError("WebSocket error encountered");
      };

      ws.onclose = () => {
        setIsConnected(false);
      };
    } catch (err) {
      console.error("Failed to initialize WebSocket client:", err);
      setError("Failed to initialize WebSocket connection");
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [wsUrl, store]);

  return (
    <div className="animator-editor">
      <h1>Animator Editor</h1>
      <div data-testid="status">
        {isConnected ? "Connected" : "Disconnected"}
      </div>
      {error && <div data-testid="error">{error}</div>}
    </div>
  );
}

export default App;
