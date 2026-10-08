import React from "react";
import { RightSidebar } from "./components/RightSidebar.js";
import { EditorProvider, useEditorStore } from "./context/EditorContext.js";

function Workspace() {
  const { doc, selectedNodeId, selectNode } = useEditorStore();

  return (
    <div
      className="editor-layout"
      style={{
        display: "flex",
        height: "100vh",
        width: "100vw",
        backgroundColor: "#0d1117",
        color: "#c9d1d9",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        overflow: "hidden",
      }}
    >
      {/* Main Workspace Area */}
      <main
        className="main-workspace"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          height: "100vh",
        }}
      >
        {/* Workspace Navbar Header */}
        <header
          style={{
            height: "48px",
            borderBottom: "1px solid #2d3748",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 16px",
            backgroundColor: "#161b22",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              style={{ fontWeight: 700, fontSize: "16px", color: "#58a6ff" }}
            >
              Animator
            </span>
            <span style={{ fontSize: "12px", color: "#8b949e" }}>
              / {doc.name}
            </span>
          </div>

          <div style={{ fontSize: "12px", color: "#8b949e" }}>
            {doc.canvas.width} × {doc.canvas.height} • {doc.canvas.fps} FPS
          </div>
        </header>

        {/* Center Canvas Preview & Layer Quick Selector */}
        <div
          style={{
            flex: 1,
            display: "flex",
            backgroundColor: "#090d13",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Canvas Viewport */}
          <div
            className="canvas-container"
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "24px",
            }}
          >
            <div
              style={{
                width: "360px",
                height: "360px",
                backgroundColor: doc.canvas.background,
                borderRadius: "8px",
                border: "1px solid #30363d",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
              }}
            >
              {doc.layers.map((layer) => {
                const isSelected = layer.id === selectedNodeId;
                return (
                  <button
                    type="button"
                    key={layer.id}
                    onClick={() => selectNode(layer.id)}
                    style={{
                      margin: "8px",
                      padding: "8px 16px",
                      borderRadius: "6px",
                      cursor: "pointer",
                      border: isSelected
                        ? "2px solid #58a6ff"
                        : "1px dashed rgba(255,255,255,0.2)",
                      backgroundColor: isSelected
                        ? "rgba(88, 166, 255, 0.15)"
                        : "transparent",
                      color: layer.style.fill?.startsWith("#")
                        ? layer.style.fill
                        : "#ffffff",
                      transition: "all 0.15s ease",
                      textAlign: "center",
                    }}
                  >
                    {layer.type === "text"
                      ? layer.style.text || layer.name
                      : layer.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Layer Selection Quick Bar */}
          <div
            style={{
              width: "200px",
              borderLeft: "1px solid #21262d",
              backgroundColor: "#161b22",
              padding: "12px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: "#8b949e",
                textTransform: "uppercase",
              }}
            >
              Layers ({doc.layers.length})
            </div>

            <button
              type="button"
              onClick={() => selectNode(null)}
              style={{
                padding: "6px 10px",
                textAlign: "left",
                backgroundColor:
                  selectedNodeId === null ? "#1f6feb" : "#21262d",
                color: "#ffffff",
                border: "none",
                borderRadius: "4px",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              None (Deselect All)
            </button>

            {doc.layers.map((layer) => (
              <button
                key={layer.id}
                type="button"
                onClick={() => selectNode(layer.id)}
                style={{
                  padding: "6px 10px",
                  textAlign: "left",
                  backgroundColor:
                    selectedNodeId === layer.id ? "#1f6feb" : "#21262d",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                {layer.name}
              </button>
            ))}
          </div>
        </div>
      </main>

      {/* Split Right Sidebar: Layer Inspector + Theme Parameters */}
      <RightSidebar />
    </div>
  );
}

export function App() {
  return (
    <EditorProvider>
      <Workspace />
    </EditorProvider>
  );
}

export default App;
