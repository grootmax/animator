import React from "react";

interface ToolbarProps {
  layerCount: number;
  paramCount: number;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export function Toolbar({
  layerCount,
  paramCount,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: ToolbarProps) {
  return (
    <header className="toolbar">
      <div className="toolbar-title">
        Animator Studio{" "}
        <span style={{ color: "#64748b", fontSize: 13, fontWeight: 400 }}>
          | M3 Inspector & Params
        </span>
      </div>
      <div className="toolbar-actions">
        <span style={{ fontSize: 12, color: "#94a3b8", marginRight: 12 }}>
          {layerCount} layers · {paramCount} params
        </span>
        <button
          type="button"
          className="btn"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="Undo"
        >
          ↺ Undo
        </button>
        <button
          type="button"
          className="btn"
          onClick={onRedo}
          disabled={!canRedo}
          aria-label="Redo"
        >
          ↻ Redo
        </button>
      </div>
    </header>
  );
}
