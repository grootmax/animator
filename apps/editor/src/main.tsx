import React from "react";
import { createRoot } from "react-dom/client";
import { Timeline } from "./components/Timeline.js";

export function App() {
  return (
    <div style={{ padding: "20px", background: "#111", minHeight: "100vh" }}>
      <h1 style={{ color: "#fff", fontFamily: "sans-serif" }}>
        Animator Editor
      </h1>
      <Timeline />
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
