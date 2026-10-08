import {
  AtomicMotionHandle,
  BinaryTimelineEncoder,
  type KeyframeData,
  PlaybackState,
  SharedMemoryClock,
} from "@animator/core";
import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

const SAMPLE_KEYFRAMES: KeyframeData[] = [
  { time: 0, property: "x", value: 0, easing: "ease-in" },
  { time: 1, property: "x", value: 200, easing: "ease-out" },
  { time: 2, property: "x", value: 400 },
  { time: 0, property: "y", value: 50 },
  { time: 2, property: "y", value: 250 },
  { time: 0, property: "fill", value: "#0000FF" },
  { time: 1, property: "fill", value: "#FF0000" },
  { time: 0, property: "path", value: "M 0 0 L 50 50 Z" },
  { time: 1.5, property: "path", value: "M 0 0 L 100 100 Z" },
];

export function App() {
  const { clock, handle } = useMemo(() => {
    const { buffer, stringTable } = BinaryTimelineEncoder.encodeToSharedBuffer(
      SAMPLE_KEYFRAMES,
      2.0,
    );
    const clockInstance = new SharedMemoryClock(buffer, stringTable);
    const handleInstance = new AtomicMotionHandle(buffer, stringTable);
    return { clock: clockInstance, handle: handleInstance };
  }, []);

  const [playheadTime, setPlayheadTime] = useState(0);
  const [tickCount, setTickCount] = useState(0);
  const [state, setState] = useState<PlaybackState>(PlaybackState.Stopped);
  const [propertyStates, setPropertyStates] = useState<
    Record<string, number | string>
  >({});

  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();

    const loop = (now: number) => {
      const deltaSeconds = (now - lastTime) / 1000;
      lastTime = now;

      // Tick shared memory clock directly on buffer
      clock.tick(deltaSeconds);

      // Lock-free atomic read handle reads playhead and motion states directly from SAB
      setPlayheadTime(handle.playheadTimeSeconds);
      setTickCount(handle.tickCount);
      setState(handle.playbackState);
      setPropertyStates(handle.getAllPropertyStates());

      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [clock, handle]);

  return (
    <div style={{ fontFamily: "sans-serif", padding: "20px" }}>
      <h1>Animator Shared Memory Clock & Binary Motion State</h1>

      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <button
          type="button"
          onClick={() => clock.play()}
          style={{
            fontWeight: state === PlaybackState.Playing ? "bold" : "normal",
          }}
        >
          Play
        </button>
        <button
          type="button"
          onClick={() => clock.pause()}
          style={{
            fontWeight: state === PlaybackState.Paused ? "bold" : "normal",
          }}
        >
          Pause
        </button>
        <button type="button" onClick={() => clock.stop()}>
          Stop
        </button>
        <button type="button" onClick={() => clock.setPlayheadTime(0.5)}>
          Seek 0.5s
        </button>
        <button type="button" onClick={() => clock.setPlayheadTime(1.0)}>
          Seek 1.0s
        </button>
      </div>

      <div
        style={{ background: "#f0f0f0", padding: "15px", borderRadius: "8px" }}
      >
        <h3>Shared Memory State (Lock-Free Read Handles)</h3>
        <p>
          <strong>Playhead Position:</strong> {playheadTime.toFixed(3)}s /{" "}
          {handle.durationSeconds.toFixed(1)}s
        </p>
        <p>
          <strong>Shared Clock Tick Count:</strong> {tickCount}
        </p>
        <p>
          <strong>Playback State:</strong>{" "}
          {state === PlaybackState.Playing
            ? "Playing"
            : state === PlaybackState.Paused
              ? "Paused"
              : "Stopped"}
        </p>
      </div>

      <div style={{ marginTop: "20px" }}>
        <h3>Active Binary Interpolated Properties</h3>
        <ul>
          {Object.entries(propertyStates).map(([key, val]) => (
            <li key={key}>
              <strong>{key}:</strong>{" "}
              {typeof val === "number" ? val.toFixed(2) : String(val)}
            </li>
          ))}
        </ul>
      </div>

      <div style={{ marginTop: "20px" }}>
        <h3>Indexed String Table Entries</h3>
        <ul>
          {handle.getStringTable().allStrings.map((str, idx) => (
            <li key={str}>
              Index {idx}: <code>{str}</code>
            </li>
          ))}
        </ul>
      </div>
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
