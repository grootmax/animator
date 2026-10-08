import {
  AnimationEngine,
  type AnimationEvent,
  AnimationEventBus,
} from "@animator/core";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Timeline } from "./Timeline.js";

export function App() {
  const [eventBus] = useState(
    () =>
      new AnimationEventBus(
        `peer-${Math.random().toString(36).substring(2, 7)}`,
      ),
  );
  const [engine] = useState(() => new AnimationEngine(eventBus));
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    // Relay animation event bus payloads across BroadcastChannel instances
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel("animator-animation-bus");
      channelRef.current = channel;

      const unsubscribe = eventBus.subscribe((event: AnimationEvent) => {
        // Broadcast local events to peers
        if (event.senderId === eventBus.id) {
          try {
            channel.postMessage(event);
          } catch {
            // Ignore channel post error if closed
          }
        }
      });

      channel.onmessage = (e: MessageEvent<AnimationEvent>) => {
        const event = e.data;
        if (event?.type && event.senderId !== eventBus.id) {
          eventBus.receive(event);
        }
      };

      return () => {
        unsubscribe();
        channel.close();
      };
    }
  }, [eventBus]);

  return (
    <div className="app-container" style={{ padding: "20px" }}>
      <h1>Animator Studio Editor</h1>
      <p style={{ color: "#666", fontSize: "14px" }}>
        Peer Session: {eventBus.id}
      </p>
      <Timeline eventBus={eventBus} engine={engine} />
    </div>
  );
}

if (typeof document !== "undefined") {
  const rootElement = document.getElementById("root");
  if (rootElement) {
    createRoot(rootElement).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  }
}
