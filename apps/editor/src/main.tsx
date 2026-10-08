import React from "react";
import { createRoot } from "react-dom/client";

export function App() {
  return <h1>Animator editor</h1>;
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
