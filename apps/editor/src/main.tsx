import React from "react";
import { createRoot } from "react-dom/client";
import { EditorCanvas } from "./EditorCanvas.js";

export function App() {
  return (
    <div
      style={{
        padding: "20px",
        backgroundColor: "#121218",
        color: "#ECECF1",
        minHeight: "100vh",
      }}
    >
      <h1 style={{ margin: "0 0 16px 0", fontSize: "24px" }}>
        Animator Web Studio
      </h1>
      <EditorCanvas width={960} height={600} />
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
