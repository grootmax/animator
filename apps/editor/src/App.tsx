import type { Op } from "@animator/core";
import { PlayerHarness } from "./PlayerHarness.js";
import { useEditorState } from "./stateBridge.js";

export function App() {
  const { doc, revision, lottieJson, dispatchOps, resetDoc } = useEditorState();

  const handleToggleColor = () => {
    const heroLayer = doc.layers.find((l) => l.id === "hero-circle");
    const nextFill = heroLayer?.fill === "#FF5A5F" ? "#3D5AFE" : "#FF5A5F";
    const ops: Op[] = [
      {
        op: "updateLayer",
        id: "hero-circle",
        set: { fill: nextFill },
      },
    ];
    dispatchOps(ops);
  };

  const handleNudgePosition = () => {
    const heroLayer = doc.layers.find((l) => l.id === "hero-circle");
    const currentX = heroLayer?.position?.[0] ?? 300;
    const nextX = currentX >= 420 ? 180 : currentX + 40;
    const ops: Op[] = [
      {
        op: "updateLayer",
        id: "hero-circle",
        set: { position: [nextX, heroLayer?.position?.[1] ?? 180] },
      },
    ];
    dispatchOps(ops);
  };

  const handleToggleBackground = () => {
    const nextBg = doc.canvas.background === "#0B1020" ? "#1A2035" : "#0B1020";
    const ops: Op[] = [{ op: "setCanvas", set: { background: nextBg } }];
    dispatchOps(ops);
  };

  const handleAddAccentLayer = () => {
    const layerId = `accent-${Date.now().toString(36)}`;
    const ops: Op[] = [
      {
        op: "addLayer",
        layer: {
          id: layerId,
          name: "Accent Path",
          type: "shape",
          position: [300, 240],
          size: [80, 80],
          fill: "#FFD600",
          shape: {
            kind: "rect",
            size: [60, 60],
            radius: 8,
          },
        },
      },
    ];
    dispatchOps(ops);
  };

  return (
    <div
      style={{
        padding: "24px",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        backgroundColor: "#0B1020",
        minHeight: "100vh",
        color: "#F7FAFC",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "20px",
          borderBottom: "1px solid #1E293B",
          paddingBottom: "14px",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 700 }}>
            Animator Editor
          </h1>
          <span style={{ fontSize: "12px", color: "#94A3B8" }}>
            Skottie Player Harness · Revision {revision} · {doc.name}
          </span>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <span
            style={{
              padding: "4px 8px",
              fontSize: "12px",
              borderRadius: "4px",
              backgroundColor: "#10B981",
              color: "#022C22",
              fontWeight: 600,
            }}
          >
            CanvasKit WASM
          </span>
        </div>
      </header>

      <main
        style={{
          display: "flex",
          gap: "24px",
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        {/* Skottie Player Harness */}
        <section aria-label="Animation Player">
          <PlayerHarness
            lottieJson={lottieJson}
            width={doc.canvas.width}
            height={doc.canvas.height}
            background={doc.canvas.background}
          />
        </section>

        {/* Live Ops & Inspector Sidebar */}
        <aside
          style={{
            flex: 1,
            minWidth: "280px",
            maxWidth: "360px",
            backgroundColor: "#161B2E",
            border: "1px solid #2A324B",
            borderRadius: "8px",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          <div>
            <h2
              style={{
                fontSize: "14px",
                margin: "0 0 10px 0",
                color: "#E2E8F0",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Live Ops State Sync
            </h2>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
              <button
                type="button"
                onClick={handleToggleColor}
                style={{
                  backgroundColor: "#2D3748",
                  color: "#E2E8F0",
                  border: "1px solid #4A5568",
                  borderRadius: "4px",
                  padding: "8px",
                  fontSize: "13px",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                🎨 Change Circle Color
              </button>
              <button
                type="button"
                onClick={handleNudgePosition}
                style={{
                  backgroundColor: "#2D3748",
                  color: "#E2E8F0",
                  border: "1px solid #4A5568",
                  borderRadius: "4px",
                  padding: "8px",
                  fontSize: "13px",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                ↔ Nudge Circle Position
              </button>
              <button
                type="button"
                onClick={handleToggleBackground}
                style={{
                  backgroundColor: "#2D3748",
                  color: "#E2E8F0",
                  border: "1px solid #4A5568",
                  borderRadius: "4px",
                  padding: "8px",
                  fontSize: "13px",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                🌓 Toggle Background Color
              </button>
              <button
                type="button"
                onClick={handleAddAccentLayer}
                style={{
                  backgroundColor: "#2D3748",
                  color: "#E2E8F0",
                  border: "1px solid #4A5568",
                  borderRadius: "4px",
                  padding: "8px",
                  fontSize: "13px",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                ➕ Add Accent Layer
              </button>
              <button
                type="button"
                onClick={() => resetDoc()}
                style={{
                  backgroundColor: "#1E293B",
                  color: "#94A3B8",
                  border: "1px solid #334155",
                  borderRadius: "4px",
                  padding: "6px",
                  fontSize: "12px",
                  cursor: "pointer",
                  marginTop: "6px",
                }}
              >
                ↺ Reset Scene
              </button>
            </div>
          </div>

          <div>
            <h2
              style={{
                fontSize: "14px",
                margin: "0 0 10px 0",
                color: "#E2E8F0",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Layers ({doc.layers.length})
            </h2>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: "6px",
              }}
            >
              {doc.layers.map((layer) => (
                <li
                  key={layer.id}
                  style={{
                    backgroundColor: "#1F293D",
                    padding: "8px 10px",
                    borderRadius: "4px",
                    fontSize: "12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span style={{ fontWeight: 500 }}>
                    {layer.name ?? layer.id}
                  </span>
                  <span
                    style={{
                      display: "inline-block",
                      width: "12px",
                      height: "12px",
                      borderRadius: "2px",
                      backgroundColor: layer.fill ?? "#FFFFFF",
                      border: "1px solid #4A5568",
                    }}
                  />
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </main>
    </div>
  );
}
