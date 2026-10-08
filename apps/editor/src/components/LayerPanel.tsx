import type { Layer } from "@animator/core";

interface LayerPanelProps {
  layers: Layer[];
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  onAddLayer?: (type: "shape" | "text") => void;
}

export function LayerPanel({
  layers,
  selectedNodeId,
  onSelectNode,
  onAddLayer,
}: LayerPanelProps) {
  return (
    <aside className="left-panel">
      <div
        className="panel-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>Layers</span>
        {onAddLayer && (
          <div style={{ display: "flex", gap: 4 }}>
            <button
              type="button"
              className="btn"
              style={{ padding: "2px 6px", fontSize: 11 }}
              onClick={() => onAddLayer("shape")}
            >
              + Rect
            </button>
            <button
              type="button"
              className="btn"
              style={{ padding: "2px 6px", fontSize: 11 }}
              onClick={() => onAddLayer("text")}
            >
              + Text
            </button>
          </div>
        )}
      </div>
      <div className="layer-list">
        {layers.map((layer) => {
          const isSelected = layer.id === selectedNodeId;
          return (
            <button
              key={layer.id}
              type="button"
              className={`layer-item ${isSelected ? "selected" : ""}`}
              style={{ width: "100%", textAlign: "left" }}
              onClick={() => onSelectNode(layer.id)}
            >
              <span style={{ fontWeight: 500 }}>{layer.name || layer.id}</span>
              <span className="layer-badge">{layer.type}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
