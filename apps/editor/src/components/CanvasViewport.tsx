import type { Layer, MotionDoc, Param } from "@animator/core";

interface CanvasViewportProps {
  doc: MotionDoc;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
}

export function resolveParamString(
  val: string | undefined,
  params: Record<string, Param>,
): string {
  if (!val) return "";
  return val.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    const trimmed = key.trim();
    if (params[trimmed]) {
      return String(params[trimmed].value);
    }
    return `{{${key}}}`;
  });
}

export function CanvasViewport({
  doc,
  selectedNodeId,
  onSelectNode,
}: CanvasViewportProps) {
  const { width, height, background } = doc.canvas;
  const resolvedBg = resolveParamString(background, doc.params);

  // Scale down preview for display in viewport
  const displayWidth = 540;
  const scaleRatio = displayWidth / width;
  const displayHeight = height * scaleRatio;

  return (
    <main className="canvas-container">
      <div
        className="canvas-viewport"
        style={{
          width: displayWidth,
          height: displayHeight,
          backgroundColor: resolvedBg || "#000000",
          position: "relative",
        }}
      >
        {doc.layers.map((layer: Layer) => {
          if (layer.visible === false) return null;

          const isSelected = layer.id === selectedNodeId;
          const posX = (layer.position?.[0] ?? width / 2) * scaleRatio;
          const posY = (layer.position?.[1] ?? height / 2) * scaleRatio;
          const scaleX = (layer.scale?.[0] ?? 100) / 100;
          const scaleY = (layer.scale?.[1] ?? 100) / 100;
          const rotation = layer.rotation ?? 0;
          const opacity = (layer.opacity ?? 100) / 100;

          const fillResolved = resolveParamString(layer.fill, doc.params);
          const strokeColorResolved = resolveParamString(
            layer.stroke?.color,
            doc.params,
          );
          const strokeWidth = (layer.stroke?.width ?? 0) * scaleRatio;

          const transformStyle: React.CSSProperties = {
            position: "absolute",
            left: posX,
            top: posY,
            transform: `translate(-50%, -50%) rotate(${rotation}deg) scale(${scaleX}, ${scaleY})`,
            opacity,
            cursor: "pointer",
            border: isSelected ? "2px solid #38bdf8" : "2px solid transparent",
            borderRadius: layer.shape?.radius
              ? layer.shape.radius * scaleRatio
              : 2,
            boxSizing: "border-box",
            transition: "all 0.1s ease-out",
            padding: 0,
            background: "none",
          };

          if (layer.type === "shape" && layer.shape?.kind === "rect") {
            const rectW = (layer.shape.size?.[0] ?? 200) * scaleRatio;
            const rectH = (layer.shape.size?.[1] ?? 100) * scaleRatio;

            return (
              <button
                key={layer.id}
                type="button"
                style={{
                  ...transformStyle,
                  width: rectW,
                  height: rectH,
                  backgroundColor: fillResolved || "transparent",
                  border: isSelected
                    ? "2px solid #38bdf8"
                    : strokeWidth > 0
                      ? `${Math.max(1, strokeWidth)}px solid ${
                          strokeColorResolved || "#ffffff"
                        }`
                      : "2px solid transparent",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectNode(layer.id);
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 4,
                    left: 6,
                    fontSize: 10,
                    color: "rgba(255,255,255,0.6)",
                    pointerEvents: "none",
                  }}
                >
                  {layer.name || layer.id}
                </span>
              </button>
            );
          }

          if (layer.type === "text") {
            const textResolved = resolveParamString(layer.text, doc.params);
            const fontSize = (layer.font?.size ?? 32) * scaleRatio;

            return (
              <button
                key={layer.id}
                type="button"
                style={{
                  ...transformStyle,
                  color: fillResolved || "#ffffff",
                  fontSize,
                  fontFamily: layer.font?.family || "sans-serif",
                  fontWeight: layer.font?.weight || 700,
                  textAlign: layer.align || "center",
                  whiteSpace: "nowrap",
                  padding: "4px 8px",
                  userSelect: "none",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectNode(layer.id);
                }}
              >
                {textResolved}
              </button>
            );
          }

          return null;
        })}
      </div>
    </main>
  );
}
