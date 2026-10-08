import React from "react";
import { useEditorStore } from "../context/EditorContext.js";

export function LayerInspector() {
  const { doc, selectedNodeId, updateTransform, updateStyle, updateLayerName } =
    useEditorStore();

  const selectedLayer = doc.layers.find((l) => l.id === selectedNodeId);

  if (!selectedNodeId || !selectedLayer) {
    return (
      <div
        className="empty-state"
        data-testid="inspector-empty-state"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px 16px",
          textAlign: "center",
          color: "#a0aec0",
          gap: "12px",
        }}
      >
        <div style={{ fontSize: "32px" }}>🔍</div>
        <div style={{ fontWeight: 600, color: "#e2e8f0", fontSize: "14px" }}>
          No Layer Selected
        </div>
        <div style={{ fontSize: "12px", maxWidth: "220px", lineHeight: "1.4" }}>
          Select a layer from the workspace to inspect and edit its properties.
        </div>
      </div>
    );
  }

  const { transform, style, type, name, id } = selectedLayer;

  return (
    <div
      className="layer-inspector-body"
      data-testid="layer-inspector-panel"
      style={{ display: "flex", flexDirection: "column", gap: "16px" }}
    >
      {/* Header Info */}
      <div
        className="inspector-group"
        style={{ display: "flex", flexDirection: "column", gap: "6px" }}
      >
        <label
          htmlFor="layer-name-input"
          style={{
            fontSize: "11px",
            fontWeight: 600,
            color: "#a0aec0",
            textTransform: "uppercase",
          }}
        >
          Layer Name
        </label>
        <input
          id="layer-name-input"
          type="text"
          value={name}
          onChange={(e) => updateLayerName(id, e.target.value)}
          aria-label="Layer Name"
          style={{
            padding: "6px 10px",
            backgroundColor: "#2d3748",
            border: "1px solid #4a5568",
            borderRadius: "4px",
            color: "#ffffff",
            fontSize: "13px",
          }}
        />
        <div
          style={{
            display: "flex",
            gap: "8px",
            fontSize: "11px",
            color: "#718096",
          }}
        >
          <span>ID: {id}</span>
          <span>•</span>
          <span style={{ textTransform: "capitalize" }}>Type: {type}</span>
        </div>
      </div>

      {/* Transform Controls */}
      <div
        className="inspector-group"
        style={{ display: "flex", flexDirection: "column", gap: "10px" }}
      >
        <div
          style={{
            fontSize: "11px",
            fontWeight: 600,
            color: "#a0aec0",
            textTransform: "uppercase",
          }}
        >
          Transform
        </div>

        {/* Position */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "8px",
          }}
        >
          <div>
            <label
              htmlFor="transform-pos-x"
              style={{
                fontSize: "11px",
                color: "#718096",
                display: "block",
                marginBottom: "2px",
              }}
            >
              Pos X (px)
            </label>
            <input
              id="transform-pos-x"
              type="number"
              aria-label="Position X"
              value={transform.position[0]}
              onChange={(e) =>
                updateTransform(id, {
                  position: [Number(e.target.value), transform.position[1]],
                })
              }
              style={{
                width: "100%",
                padding: "6px 8px",
                backgroundColor: "#2d3748",
                border: "1px solid #4a5568",
                borderRadius: "4px",
                color: "#ffffff",
                fontSize: "12px",
              }}
            />
          </div>
          <div>
            <label
              htmlFor="transform-pos-y"
              style={{
                fontSize: "11px",
                color: "#718096",
                display: "block",
                marginBottom: "2px",
              }}
            >
              Pos Y (px)
            </label>
            <input
              id="transform-pos-y"
              type="number"
              aria-label="Position Y"
              value={transform.position[1]}
              onChange={(e) =>
                updateTransform(id, {
                  position: [transform.position[0], Number(e.target.value)],
                })
              }
              style={{
                width: "100%",
                padding: "6px 8px",
                backgroundColor: "#2d3748",
                border: "1px solid #4a5568",
                borderRadius: "4px",
                color: "#ffffff",
                fontSize: "12px",
              }}
            />
          </div>
        </div>

        {/* Scale */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "8px",
          }}
        >
          <div>
            <label
              htmlFor="transform-scale-x"
              style={{
                fontSize: "11px",
                color: "#718096",
                display: "block",
                marginBottom: "2px",
              }}
            >
              Scale X (%)
            </label>
            <input
              id="transform-scale-x"
              type="number"
              aria-label="Scale X"
              value={transform.scale[0]}
              onChange={(e) =>
                updateTransform(id, {
                  scale: [Number(e.target.value), transform.scale[1]],
                })
              }
              style={{
                width: "100%",
                padding: "6px 8px",
                backgroundColor: "#2d3748",
                border: "1px solid #4a5568",
                borderRadius: "4px",
                color: "#ffffff",
                fontSize: "12px",
              }}
            />
          </div>
          <div>
            <label
              htmlFor="transform-scale-y"
              style={{
                fontSize: "11px",
                color: "#718096",
                display: "block",
                marginBottom: "2px",
              }}
            >
              Scale Y (%)
            </label>
            <input
              id="transform-scale-y"
              type="number"
              aria-label="Scale Y"
              value={transform.scale[1]}
              onChange={(e) =>
                updateTransform(id, {
                  scale: [transform.scale[0], Number(e.target.value)],
                })
              }
              style={{
                width: "100%",
                padding: "6px 8px",
                backgroundColor: "#2d3748",
                border: "1px solid #4a5568",
                borderRadius: "4px",
                color: "#ffffff",
                fontSize: "12px",
              }}
            />
          </div>
        </div>

        {/* Rotation & Opacity */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "8px",
          }}
        >
          <div>
            <label
              htmlFor="transform-rotation"
              style={{
                fontSize: "11px",
                color: "#718096",
                display: "block",
                marginBottom: "2px",
              }}
            >
              Rotation (deg)
            </label>
            <input
              id="transform-rotation"
              type="number"
              aria-label="Rotation"
              value={transform.rotation}
              onChange={(e) =>
                updateTransform(id, { rotation: Number(e.target.value) })
              }
              style={{
                width: "100%",
                padding: "6px 8px",
                backgroundColor: "#2d3748",
                border: "1px solid #4a5568",
                borderRadius: "4px",
                color: "#ffffff",
                fontSize: "12px",
              }}
            />
          </div>
          <div>
            <label
              htmlFor="transform-opacity"
              style={{
                fontSize: "11px",
                color: "#718096",
                display: "block",
                marginBottom: "2px",
              }}
            >
              Opacity (%)
            </label>
            <input
              id="transform-opacity"
              type="number"
              aria-label="Opacity"
              min="0"
              max="100"
              value={transform.opacity}
              onChange={(e) =>
                updateTransform(id, { opacity: Number(e.target.value) })
              }
              style={{
                width: "100%",
                padding: "6px 8px",
                backgroundColor: "#2d3748",
                border: "1px solid #4a5568",
                borderRadius: "4px",
                color: "#ffffff",
                fontSize: "12px",
              }}
            />
          </div>
        </div>
      </div>

      {/* Style Controls */}
      <div
        className="inspector-group"
        style={{ display: "flex", flexDirection: "column", gap: "10px" }}
      >
        <div
          style={{
            fontSize: "11px",
            fontWeight: 600,
            color: "#a0aec0",
            textTransform: "uppercase",
          }}
        >
          Styles
        </div>

        {/* Fill Color */}
        <div>
          <label
            htmlFor="style-fill-input"
            style={{
              fontSize: "11px",
              color: "#718096",
              display: "block",
              marginBottom: "2px",
            }}
          >
            Fill Color
          </label>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <input
              type="color"
              aria-label="Fill Color Picker"
              value={style.fill?.startsWith("#") ? style.fill : "#FF5A5F"}
              onChange={(e) => updateStyle(id, { fill: e.target.value })}
              style={{
                width: "32px",
                height: "32px",
                padding: "0",
                border: "1px solid #4a5568",
                borderRadius: "4px",
                backgroundColor: "transparent",
                cursor: "pointer",
              }}
            />
            <input
              id="style-fill-input"
              type="text"
              aria-label="Fill Color Text"
              value={style.fill || ""}
              onChange={(e) => updateStyle(id, { fill: e.target.value })}
              style={{
                flex: 1,
                padding: "6px 8px",
                backgroundColor: "#2d3748",
                border: "1px solid #4a5568",
                borderRadius: "4px",
                color: "#ffffff",
                fontSize: "12px",
              }}
            />
          </div>
        </div>

        {/* Stroke */}
        <div>
          <label
            htmlFor="style-stroke-color"
            style={{
              fontSize: "11px",
              color: "#718096",
              display: "block",
              marginBottom: "2px",
            }}
          >
            Stroke Color & Width
          </label>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <input
              type="color"
              aria-label="Stroke Color Picker"
              value={
                style.stroke?.color?.startsWith("#")
                  ? style.stroke.color
                  : "#4A5568"
              }
              onChange={(e) =>
                updateStyle(id, {
                  stroke: {
                    color: e.target.value,
                    width: style.stroke?.width ?? 1,
                  },
                })
              }
              style={{
                width: "32px",
                height: "32px",
                padding: "0",
                border: "1px solid #4a5568",
                borderRadius: "4px",
                backgroundColor: "transparent",
                cursor: "pointer",
              }}
            />
            <input
              id="style-stroke-color"
              type="text"
              aria-label="Stroke Color Text"
              value={style.stroke?.color || ""}
              onChange={(e) =>
                updateStyle(id, {
                  stroke: {
                    color: e.target.value,
                    width: style.stroke?.width ?? 1,
                  },
                })
              }
              style={{
                flex: 1,
                padding: "6px 8px",
                backgroundColor: "#2d3748",
                border: "1px solid #4a5568",
                borderRadius: "4px",
                color: "#ffffff",
                fontSize: "12px",
              }}
            />
            <input
              type="number"
              aria-label="Stroke Width"
              value={style.stroke?.width ?? 0}
              onChange={(e) =>
                updateStyle(id, {
                  stroke: {
                    color: style.stroke?.color || "#FFFFFF",
                    width: Number(e.target.value),
                  },
                })
              }
              style={{
                width: "50px",
                padding: "6px 6px",
                backgroundColor: "#2d3748",
                border: "1px solid #4a5568",
                borderRadius: "4px",
                color: "#ffffff",
                fontSize: "12px",
              }}
            />
          </div>
        </div>

        {/* Text specific styles */}
        {type === "text" && (
          <>
            <div>
              <label
                htmlFor="text-content-input"
                style={{
                  fontSize: "11px",
                  color: "#718096",
                  display: "block",
                  marginBottom: "2px",
                }}
              >
                Text Content
              </label>
              <textarea
                id="text-content-input"
                aria-label="Text Content"
                rows={2}
                value={style.text || ""}
                onChange={(e) => updateStyle(id, { text: e.target.value })}
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  backgroundColor: "#2d3748",
                  border: "1px solid #4a5568",
                  borderRadius: "4px",
                  color: "#ffffff",
                  fontSize: "12px",
                  resize: "vertical",
                }}
              />
            </div>
            <div>
              <label
                htmlFor="font-size-input"
                style={{
                  fontSize: "11px",
                  color: "#718096",
                  display: "block",
                  marginBottom: "2px",
                }}
              >
                Font Size (px)
              </label>
              <input
                id="font-size-input"
                type="number"
                aria-label="Font Size"
                value={style.fontSize || 36}
                onChange={(e) =>
                  updateStyle(id, { fontSize: Number(e.target.value) })
                }
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  backgroundColor: "#2d3748",
                  border: "1px solid #4a5568",
                  borderRadius: "4px",
                  color: "#ffffff",
                  fontSize: "12px",
                }}
              />
            </div>
          </>
        )}

        {/* Shape specific styles */}
        {type === "shape" && style.size && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "8px",
            }}
          >
            <div>
              <label
                htmlFor="shape-width-input"
                style={{
                  fontSize: "11px",
                  color: "#718096",
                  display: "block",
                  marginBottom: "2px",
                }}
              >
                Width (px)
              </label>
              <input
                id="shape-width-input"
                type="number"
                aria-label="Shape Width"
                value={style.size[0]}
                onChange={(e) =>
                  updateStyle(id, {
                    size: [Number(e.target.value), style.size?.[1] ?? 0],
                  })
                }
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  backgroundColor: "#2d3748",
                  border: "1px solid #4a5568",
                  borderRadius: "4px",
                  color: "#ffffff",
                  fontSize: "12px",
                }}
              />
            </div>
            <div>
              <label
                htmlFor="shape-height-input"
                style={{
                  fontSize: "11px",
                  color: "#718096",
                  display: "block",
                  marginBottom: "2px",
                }}
              >
                Height (px)
              </label>
              <input
                id="shape-height-input"
                type="number"
                aria-label="Shape Height"
                value={style.size[1]}
                onChange={(e) =>
                  updateStyle(id, {
                    size: [style.size?.[0] ?? 0, Number(e.target.value)],
                  })
                }
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  backgroundColor: "#2d3748",
                  border: "1px solid #4a5568",
                  borderRadius: "4px",
                  color: "#ffffff",
                  fontSize: "12px",
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
