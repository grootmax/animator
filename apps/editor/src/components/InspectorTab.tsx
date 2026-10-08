import type { Layer } from "@animator/core";
import React from "react";

interface InspectorTabProps {
  selectedLayer: Layer | null;
  onUpdateLayer: (id: string, updates: Partial<Layer>) => void;
}

export function InspectorTab({
  selectedLayer,
  onUpdateLayer,
}: InspectorTabProps) {
  if (!selectedLayer) {
    return (
      <div className="empty-state">
        <div style={{ fontSize: 24, marginBottom: 8 }}>🔍</div>
        <div style={{ fontWeight: 600, color: "#f8fafc", marginBottom: 4 }}>
          No Layer Selected
        </div>
        <div>
          Select a layer from the panel or canvas to inspect and edit
          properties.
        </div>
      </div>
    );
  }

  const {
    id,
    name,
    type,
    position,
    scale,
    rotation,
    opacity,
    fill,
    stroke,
    shape,
    text,
    font,
  } = selectedLayer;

  const handlePositionChange = (axis: 0 | 1, value: number) => {
    const currentX = position?.[0] ?? 0;
    const currentY = position?.[1] ?? 0;
    const newPos: [number, number] =
      axis === 0 ? [value, currentY] : [currentX, value];
    onUpdateLayer(id, { position: newPos });
  };

  const handleScaleChange = (axis: 0 | 1, value: number) => {
    const currentX = scale?.[0] ?? 100;
    const currentY = scale?.[1] ?? 100;
    const newScale: [number, number] =
      axis === 0 ? [value, currentY] : [currentX, value];
    onUpdateLayer(id, { scale: newScale });
  };

  return (
    <div className="inspector-panel">
      <div className="form-group">
        <label htmlFor="layer-name" className="form-label">
          Layer Name
        </label>
        <input
          id="layer-name"
          type="text"
          className="form-input"
          value={name || id}
          onChange={(e) => onUpdateLayer(id, { name: e.target.value })}
        />
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <span style={{ fontSize: 11, color: "#94a3b8" }}>ID: {id}</span>
        <span className="layer-badge">{type}</span>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="pos-x" className="form-label">
            Pos X
          </label>
          <input
            id="pos-x"
            type="number"
            className="form-input"
            value={position?.[0] ?? 0}
            onChange={(e) =>
              handlePositionChange(0, Number.parseFloat(e.target.value) || 0)
            }
          />
        </div>
        <div className="form-group">
          <label htmlFor="pos-y" className="form-label">
            Pos Y
          </label>
          <input
            id="pos-y"
            type="number"
            className="form-input"
            value={position?.[1] ?? 0}
            onChange={(e) =>
              handlePositionChange(1, Number.parseFloat(e.target.value) || 0)
            }
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="scale-x" className="form-label">
            Scale X (%)
          </label>
          <input
            id="scale-x"
            type="number"
            className="form-input"
            value={scale?.[0] ?? 100}
            onChange={(e) =>
              handleScaleChange(0, Number.parseFloat(e.target.value) || 0)
            }
          />
        </div>
        <div className="form-group">
          <label htmlFor="scale-y" className="form-label">
            Scale Y (%)
          </label>
          <input
            id="scale-y"
            type="number"
            className="form-input"
            value={scale?.[1] ?? 100}
            onChange={(e) =>
              handleScaleChange(1, Number.parseFloat(e.target.value) || 0)
            }
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="rotation" className="form-label">
            Rotation (deg)
          </label>
          <input
            id="rotation"
            type="number"
            className="form-input"
            value={rotation ?? 0}
            onChange={(e) =>
              onUpdateLayer(id, {
                rotation: Number.parseFloat(e.target.value) || 0,
              })
            }
          />
        </div>
        <div className="form-group">
          <label htmlFor="opacity" className="form-label">
            Opacity (%)
          </label>
          <input
            id="opacity"
            type="number"
            className="form-input"
            min={0}
            max={100}
            value={opacity ?? 100}
            onChange={(e) =>
              onUpdateLayer(id, {
                opacity: Number.parseFloat(e.target.value) || 0,
              })
            }
          />
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="fill-color" className="form-label">
          Fill Color
        </label>
        <div className="color-picker-row">
          {!fill?.startsWith("{{") && (
            <input
              type="color"
              className="color-input-swatch"
              value={fill?.startsWith("#") ? fill : "#000000"}
              onChange={(e) => onUpdateLayer(id, { fill: e.target.value })}
            />
          )}
          <input
            id="fill-color"
            type="text"
            className="form-input"
            placeholder="#000000 or {{paramName}}"
            value={fill ?? ""}
            onChange={(e) => onUpdateLayer(id, { fill: e.target.value })}
          />
        </div>
      </div>

      {stroke !== undefined && (
        <>
          <div className="form-group">
            <label htmlFor="stroke-color" className="form-label">
              Stroke Color
            </label>
            <div className="color-picker-row">
              {!stroke.color.startsWith("{{") && (
                <input
                  type="color"
                  className="color-input-swatch"
                  value={
                    stroke.color.startsWith("#") ? stroke.color : "#ffffff"
                  }
                  onChange={(e) =>
                    onUpdateLayer(id, {
                      stroke: { ...stroke, color: e.target.value },
                    })
                  }
                />
              )}
              <input
                id="stroke-color"
                type="text"
                className="form-input"
                placeholder="#ffffff or {{paramName}}"
                value={stroke.color}
                onChange={(e) =>
                  onUpdateLayer(id, {
                    stroke: { ...stroke, color: e.target.value },
                  })
                }
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="stroke-width" className="form-label">
              Stroke Width (px)
            </label>
            <input
              id="stroke-width"
              type="number"
              className="form-input"
              min={0}
              value={stroke.width}
              onChange={(e) =>
                onUpdateLayer(id, {
                  stroke: {
                    ...stroke,
                    width: Number.parseFloat(e.target.value) || 0,
                  },
                })
              }
            />
          </div>
        </>
      )}

      {type === "shape" && shape?.kind === "rect" && (
        <>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="rect-width" className="form-label">
                Width (px)
              </label>
              <input
                id="rect-width"
                type="number"
                className="form-input"
                value={shape.size?.[0] ?? 100}
                onChange={(e) =>
                  onUpdateLayer(id, {
                    shape: {
                      ...shape,
                      size: [
                        Number.parseFloat(e.target.value) || 0,
                        shape.size?.[1] ?? 100,
                      ],
                    },
                  })
                }
              />
            </div>
            <div className="form-group">
              <label htmlFor="rect-height" className="form-label">
                Height (px)
              </label>
              <input
                id="rect-height"
                type="number"
                className="form-input"
                value={shape.size?.[1] ?? 100}
                onChange={(e) =>
                  onUpdateLayer(id, {
                    shape: {
                      ...shape,
                      size: [
                        shape.size?.[0] ?? 100,
                        Number.parseFloat(e.target.value) || 0,
                      ],
                    },
                  })
                }
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="rect-radius" className="form-label">
              Corner Radius
            </label>
            <input
              id="rect-radius"
              type="number"
              className="form-input"
              value={shape.radius ?? 0}
              onChange={(e) =>
                onUpdateLayer(id, {
                  shape: {
                    ...shape,
                    radius: Number.parseFloat(e.target.value) || 0,
                  },
                })
              }
            />
          </div>
        </>
      )}

      {type === "text" && (
        <>
          <div className="form-group">
            <label htmlFor="text-content" className="form-label">
              Text Content
            </label>
            <input
              id="text-content"
              type="text"
              className="form-input"
              value={text ?? ""}
              onChange={(e) => onUpdateLayer(id, { text: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label htmlFor="font-size" className="form-label">
              Font Size (px)
            </label>
            <input
              id="font-size"
              type="number"
              className="form-input"
              value={font?.size ?? 24}
              onChange={(e) =>
                onUpdateLayer(id, {
                  font: {
                    family: font?.family || "Inter",
                    weight: font?.weight || 700,
                    size: Number.parseFloat(e.target.value) || 12,
                  },
                })
              }
            />
          </div>
        </>
      )}
    </div>
  );
}
